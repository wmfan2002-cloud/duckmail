import { getArchivePool } from "@/lib/archive/db"
import { migrate, planMigrations } from "@/lib/archive/migration-runner"

async function main() {
  const args = new Set(process.argv.slice(2))
  if (args.has("--plan")) {
    const migrations = await planMigrations()
    console.log("[archive] migration plan:", migrations.join(", ") || "(empty)")
    return
  }

  const dryRun = args.has("--dry-run")
  const pool = getArchivePool()
  try {
    const summary = await migrate(pool, { dryRun })
    console.log(
      `[archive] migrate finished (dryRun=${dryRun}) applied=${summary.applied.length} pending=${summary.pending.length}`,
    )
    if (summary.pending.length > 0) {
      console.log(`[archive] pending: ${summary.pending.join(", ")}`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("[archive] migrate failed:", error.message)
  process.exit(1)
})
