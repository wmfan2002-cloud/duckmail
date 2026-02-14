import { upsertMailboxCredential } from "@/lib/archive/mailbox-repository"

type ImportFormat = "csv" | "text"

type ParsedMailboxRow = {
  email: string
  line: number
  password: string
  provider?: string
}

type ImportResultItem = {
  email?: string
  id?: number
  line: number
  reason?: string
  status: "success" | "failed"
}

type ImportSummary = {
  failed: number
  format: ImportFormat
  results: ImportResultItem[]
  success: number
  total: number
}

type ImportOptions = {
  content: string
  defaultProvider?: string
  format: ImportFormat
}

function splitCsvColumns(line: string) {
  const columns: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === "," && !inQuotes) {
      columns.push(current.trim())
      current = ""
      continue
    }

    current += char
  }
  columns.push(current.trim())
  return columns
}

function parseTextColumns(line: string) {
  return line
    .split(/----|,|\||;|\t|\s+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function parseMailboxImportRows(options: ImportOptions) {
  const lines = options.content.replace(/\r\n/g, "\n").split("\n")
  const parsedRows: ParsedMailboxRow[] = []
  const failures: ImportResultItem[] = []
  const defaultProvider = options.defaultProvider?.trim() || "mail.tm"

  let firstDataLineHandled = false
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i]
    const line = rawLine.trim()
    const lineNumber = i + 1
    if (!line) {
      continue
    }

    const columns = options.format === "csv" ? splitCsvColumns(line) : parseTextColumns(line)
    if (!firstDataLineHandled) {
      const maybeHeader0 = (columns[0] || "").toLowerCase()
      const maybeHeader1 = (columns[1] || "").toLowerCase()
      if (maybeHeader0.includes("email") && maybeHeader1.includes("password")) {
        firstDataLineHandled = true
        continue
      }
      firstDataLineHandled = true
    }

    if (columns.length < 2) {
      failures.push({
        line: lineNumber,
        status: "failed",
        reason: "invalid row format, expected email and password columns",
      })
      continue
    }

    const email = normalizeEmail(columns[0])
    const password = columns[1]
    const provider = (columns[2] || defaultProvider).trim() || defaultProvider
    if (!email || !email.includes("@")) {
      failures.push({
        line: lineNumber,
        status: "failed",
        reason: "invalid email",
        email: columns[0],
      })
      continue
    }

    if (!password || password.trim().length === 0) {
      failures.push({
        line: lineNumber,
        status: "failed",
        reason: "empty password",
        email,
      })
      continue
    }

    parsedRows.push({
      email,
      password,
      provider,
      line: lineNumber,
    })
  }

  return {
    parsedRows,
    failures,
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function importMailboxes(options: ImportOptions): Promise<ImportSummary> {
  const { parsedRows, failures } = parseMailboxImportRows(options)
  const results: ImportResultItem[] = [...failures]

  for (const row of parsedRows) {
    try {
      const created = await upsertMailboxCredential({
        email: row.email,
        password: row.password,
        provider: row.provider,
      })
      results.push({
        line: row.line,
        email: row.email,
        id: created.id,
        status: "success",
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : "import failed"
      results.push({
        line: row.line,
        email: row.email,
        status: "failed",
        reason,
      })
    }

    // 顺序限流，避免批量导入对上游/数据库造成突发抖动
    await sleep(10)
  }

  results.sort((a, b) => a.line - b.line)
  const success = results.filter((item) => item.status === "success").length
  const failed = results.length - success
  return {
    format: options.format,
    total: results.length,
    success,
    failed,
    results,
  }
}
