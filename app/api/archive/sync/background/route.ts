import { NextRequest, NextResponse } from "next/server"

import { checkArchiveAdminToken } from "@/lib/archive/admin-auth"
import { processQueuedSyncRuns } from "@/lib/archive/sync-worker"

export const runtime = "nodejs"

type BackgroundPayload = {
  limit?: number
}

export async function POST(request: NextRequest) {
  if (!checkArchiveAdminToken(request)) {
    return NextResponse.json({ code: "FORBIDDEN", error: "invalid admin token" }, { status: 403 })
  }

  let payload: BackgroundPayload
  try {
    payload = await request.json()
  } catch {
    payload = {}
  }

  try {
    const summary = await processQueuedSyncRuns({
      limit: payload.limit,
    })
    return NextResponse.json({
      code: "OK",
      data: summary,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "background sync failed"
    return NextResponse.json({ code: "BACKGROUND_FAILED", error: message }, { status: 500 })
  }
}
