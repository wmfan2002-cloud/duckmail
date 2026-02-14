import { createHash } from "crypto"
import { promises as fs } from "fs"
import path from "path"

import type { Pool, PoolClient } from "@neondatabase/serverless"

const MIGRATION_TABLE = "_archive_migrations"
const MIGRATION_DIR = path.join(process.cwd(), "db", "migrations")

type MigrationFile = {
  checksum: string
  downPath: string
  name: string
  upPath: string
}

type MigrationSummary = {
  applied: string[]
  pending: string[]
}

type RollbackSummary = {
  rolledBack: string[]
}

type MigrateOptions = {
  dryRun?: boolean
}

type RollbackOptions = {
  dryRun?: boolean
  steps?: number
}

async function ensureMigrationTable(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

async function readMigrationFiles() {
  const entries = await fs.readdir(MIGRATION_DIR)
  const upEntries = entries.filter((entry) => entry.endsWith(".up.sql")).sort()

  const files: MigrationFile[] = []
  for (const upEntry of upEntries) {
    const name = upEntry.replace(/\.up\.sql$/, "")
    const downEntry = `${name}.down.sql`
    if (!entries.includes(downEntry)) {
      throw new Error(`Missing rollback file for migration: ${name}`)
    }

    const upPath = path.join(MIGRATION_DIR, upEntry)
    const downPath = path.join(MIGRATION_DIR, downEntry)
    const sql = await fs.readFile(upPath, "utf8")
    const checksum = createHash("sha256").update(sql).digest("hex")

    files.push({
      name,
      upPath,
      downPath,
      checksum,
    })
  }

  return files
}

export async function planMigrations() {
  const files = await readMigrationFiles()
  return files.map((file) => file.name)
}

async function getAppliedMigrationSet(client: PoolClient) {
  const result = await client.query<{ name: string }>(
    `SELECT name FROM ${MIGRATION_TABLE} ORDER BY id ASC;`,
  )
  return new Set(result.rows.map((row) => row.name))
}

async function runSqlFile(client: PoolClient, sqlPath: string) {
  const sql = await fs.readFile(sqlPath, "utf8")
  await client.query(sql)
}

export async function migrate(pool: Pool, options: MigrateOptions = {}): Promise<MigrationSummary> {
  const client = await pool.connect()
  try {
    await ensureMigrationTable(client)
    const files = await readMigrationFiles()
    const appliedSet = await getAppliedMigrationSet(client)
    const pendingFiles = files.filter((file) => !appliedSet.has(file.name))

    if (options.dryRun) {
      return {
        applied: [...appliedSet],
        pending: pendingFiles.map((file) => file.name),
      }
    }

    const appliedThisRun: string[] = []
    for (const file of pendingFiles) {
      await client.query("BEGIN")
      try {
        await runSqlFile(client, file.upPath)
        await client.query(
          `INSERT INTO ${MIGRATION_TABLE} (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING;`,
          [file.name, file.checksum],
        )
        await client.query("COMMIT")
        appliedThisRun.push(file.name)
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      }
    }

    return {
      applied: [...appliedSet, ...appliedThisRun],
      pending: [],
    }
  } finally {
    client.release()
  }
}

export async function rollback(pool: Pool, options: RollbackOptions = {}): Promise<RollbackSummary> {
  const steps = options.steps ?? 1
  if (steps < 1) {
    throw new Error("Rollback steps must be >= 1")
  }

  const client = await pool.connect()
  try {
    await ensureMigrationTable(client)
    const allFiles = await readMigrationFiles()
    const fileMap = new Map(allFiles.map((file) => [file.name, file]))
    const result = await client.query<{ name: string }>(
      `SELECT name FROM ${MIGRATION_TABLE} ORDER BY id DESC LIMIT $1;`,
      [steps],
    )

    const toRollback = result.rows.map((row) => row.name)
    if (options.dryRun) {
      return { rolledBack: toRollback }
    }

    const rolledBack: string[] = []
    for (const migrationName of toRollback) {
      const file = fileMap.get(migrationName)
      if (!file) {
        throw new Error(`Unknown migration in table: ${migrationName}`)
      }

      await client.query("BEGIN")
      try {
        await runSqlFile(client, file.downPath)
        await client.query(`DELETE FROM ${MIGRATION_TABLE} WHERE name = $1;`, [migrationName])
        await client.query("COMMIT")
        rolledBack.push(migrationName)
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      }
    }

    return { rolledBack }
  } finally {
    client.release()
  }
}
