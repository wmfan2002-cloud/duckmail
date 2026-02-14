import { parseMailboxImportRows } from "@/lib/archive/mailbox-import"

function createCsvLines(total: number) {
  const rows = ["email,password,provider"]
  for (let i = 1; i <= total; i += 1) {
    rows.push(`user${i}@example.com,password-${i},mail.tm`)
  }
  return rows.join("\n")
}

function main() {
  const csvContent = `${createCsvLines(500)}\ninvalid-line-without-comma`
  const parsed = parseMailboxImportRows({
    format: "csv",
    content: csvContent,
  })

  if (parsed.parsedRows.length !== 500) {
    throw new Error(`expected 500 parsed rows, got ${parsed.parsedRows.length}`)
  }
  if (parsed.failures.length !== 1) {
    throw new Error(`expected 1 failure row, got ${parsed.failures.length}`)
  }
  if (parsed.failures[0].line !== 502) {
    throw new Error(`expected failure line 502, got ${parsed.failures[0].line}`)
  }

  const textParsed = parseMailboxImportRows({
    format: "text",
    content: "foo@example.com----p1\nbar@example.com p2",
  })
  if (textParsed.parsedRows.length !== 2 || textParsed.failures.length !== 0) {
    throw new Error("text format parse failed")
  }

  console.log(
    `[archive] import parser self-test ok parsed=${parsed.parsedRows.length} failures=${parsed.failures.length}`,
  )
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown"
  console.error(`[archive] import parser self-test failed: ${message}`)
  process.exit(1)
}
