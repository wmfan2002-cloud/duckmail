import { getArchiveDatabaseUrl, getArchiveMasterKey } from "@/lib/archive/env"

function main() {
  const databaseUrl = getArchiveDatabaseUrl()
  const masterKey = getArchiveMasterKey()
  console.log(
    `[archive] config ok database_url_len=${databaseUrl.length} master_key_len=${Buffer.byteLength(masterKey, "utf8")}`,
  )
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown"
  console.error(`[archive] config invalid: ${message}`)
  process.exit(1)
}
