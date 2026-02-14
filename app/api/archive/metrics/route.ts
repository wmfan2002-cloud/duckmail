import { NextRequest, NextResponse } from "next/server"

import { getSyncMetrics } from "@/lib/archive/sync-repository"

export const runtime = "nodejs"

function parsePositiveFloat(raw: string | null, fallback: number) {
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return value
}

function parsePositiveInt(raw: string | null, fallback: number) {
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    return fallback
  }
  return value
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const windowHours = parsePositiveInt(searchParams.get("windowHours"), 24)
  const thresholdFailureRate = parsePositiveFloat(searchParams.get("thresholdFailureRate"), 0.1)
  const thresholdP95LatencyMs = parsePositiveFloat(searchParams.get("thresholdP95LatencyMs"), 5000)

  try {
    const metrics = await getSyncMetrics({
      windowHours,
      thresholdFailureRate,
      thresholdP95LatencyMs,
    })
    return NextResponse.json({
      code: "OK",
      data: metrics,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "metrics fetch failed"
    return NextResponse.json({ code: "METRICS_FAILED", error: message }, { status: 500 })
  }
}
