import { getArchivePool } from "@/lib/archive/db"
import { rollback } from "@/lib/archive/migration-runner"

function parseSteps(args: string[]) {
  const raw = args.find((arg) => arg.startsWith("--steps="))
  if (!raw) {
    return 1
  }
  const value = Number(raw.split("=")[1])
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Invalid --steps value, expected positive integer.")
  }
  return value
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const steps = parseSteps(args)
  const pool = getArchivePool()

  try {
    const summary = await rollback(pool, { dryRun, steps })
    console.log(
      `[archive] rollback finished (dryRun=${dryRun}) steps=${steps} rolledBack=${summary.rolledBack.length}`,
    )
    if (summary.rolledBack.length > 0) {
      console.log(`[archive] rolled back: ${summary.rolledBack.join(", ")}`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("[archive] rollback failed:", error.message)
  process.exit(1)
})
