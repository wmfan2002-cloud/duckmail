import { buildSyncMetrics } from "@/lib/archive/metrics"

function main() {
  const rows = [
    {
      status: "success",
      startedAt: new Date("2026-01-01T00:00:00Z"),
      finishedAt: new Date("2026-01-01T00:00:02Z"),
    },
    {
      status: "failed",
      startedAt: new Date("2026-01-01T00:01:00Z"),
      finishedAt: new Date("2026-01-01T00:01:08Z"),
    },
    {
      status: "success",
      startedAt: new Date("2026-01-01T00:02:00Z"),
      finishedAt: new Date("2026-01-01T00:02:03Z"),
    },
  ]

  const result = buildSyncMetrics(rows, {
    failureRate: 0.2,
    p95LatencyMs: 9000,
  })
  if (result.totalRuns !== 3) {
    throw new Error("unexpected totalRuns")
  }
  if (result.failedRuns !== 1) {
    throw new Error("unexpected failedRuns")
  }
  if (!result.alerts.highFailureRate) {
    throw new Error("highFailureRate alert should be true")
  }
  if (result.alerts.highP95Latency) {
    throw new Error("highP95Latency alert should be false")
  }

  console.log(
    `[archive] metrics self-test ok failureRate=${result.failureRate.toFixed(3)} p95=${result.p95LatencyMs}`,
  )
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown"
  console.error(`[archive] metrics self-test failed: ${message}`)
  process.exit(1)
}
