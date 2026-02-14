type SyncRunMetricRow = {
  finishedAt: Date | null
  startedAt: Date | null
  status: string
}

type Thresholds = {
  failureRate: number
  p95LatencyMs: number
}

function percentile(values: number[], p: number) {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]
}

export function buildSyncMetrics(rows: SyncRunMetricRow[], thresholds: Thresholds) {
  const total = rows.length
  const failed = rows.filter((row) => row.status === "failed").length
  const failureRate = total > 0 ? failed / total : 0

  const durations = rows
    .filter((row) => row.startedAt && row.finishedAt)
    .map((row) => row.finishedAt!.getTime() - row.startedAt!.getTime())
    .filter((value) => value >= 0)
  const avgLatencyMs =
    durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0
  const p95LatencyMs = percentile(durations, 95)

  const alerts = {
    highFailureRate: failureRate >= thresholds.failureRate,
    highP95Latency: p95LatencyMs >= thresholds.p95LatencyMs,
  }

  return {
    totalRuns: total,
    failedRuns: failed,
    failureRate,
    avgLatencyMs,
    p95LatencyMs,
    alerts,
  }
}
