import { neonConfig, Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"
import ws from "ws"

import { schema } from "@/db/schema"
import { getArchiveDatabaseUrl } from "@/lib/archive/env"

if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws
}

type ArchiveDbGlobal = typeof globalThis & {
  __archivePool?: Pool
}

function createPool() {
  return new Pool({
    connectionString: getArchiveDatabaseUrl(),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
}

export function getArchivePool() {
  const g = globalThis as ArchiveDbGlobal
  if (!g.__archivePool) {
    g.__archivePool = createPool()
  }

  return g.__archivePool
}

export function getArchiveDb() {
  return drizzle(getArchivePool(), { schema })
}
