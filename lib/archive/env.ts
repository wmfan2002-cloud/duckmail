const MIN_MASTER_KEY_LENGTH = 32

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function getArchiveDatabaseUrl(): string {
  const databaseUrl = readEnv("DATABASE_URL")
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL for archive database connection.")
  }

  return databaseUrl
}

export function getArchiveMasterKey(): string {
  const masterKey = readEnv("ARCHIVE_MASTER_KEY")
  if (!masterKey) {
    throw new Error("Missing ARCHIVE_MASTER_KEY for mailbox credential encryption.")
  }

  if (Buffer.byteLength(masterKey, "utf8") < MIN_MASTER_KEY_LENGTH) {
    throw new Error(
      `Invalid ARCHIVE_MASTER_KEY: expected at least ${MIN_MASTER_KEY_LENGTH} bytes.`,
    )
  }

  return masterKey
}
