import { NextRequest, NextResponse } from "next/server"

import { listRecentSyncErrors, listRecentSyncRuns } from "@/lib/archive/sync-repository"

export const runtime = "nodejs"

function parseLimit(raw: string | null, fallback: number) {
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
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), 20)
  const errorLimit = parseLimit(request.nextUrl.searchParams.get("errorLimit"), 20)

  try {
    const [runs, errors] = await Promise.all([
      listRecentSyncRuns(limit),
      listRecentSyncErrors(errorLimit),
    ])
    return NextResponse.json({
      code: "OK",
      data: {
        runs,
        errors,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "sync runs fetch failed"
    return NextResponse.json({ code: "SYNC_RUNS_FETCH_FAILED", error: message }, { status: 500 })
  }
}
