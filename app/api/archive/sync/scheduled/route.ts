import { NextRequest, NextResponse } from "next/server"

import { checkArchiveAdminToken } from "@/lib/archive/admin-auth"
import { dispatchDueSyncRuns, processQueuedSyncRuns } from "@/lib/archive/sync-worker"

export const runtime = "nodejs"

type ScheduledPayload = {
  dueMinutes?: number
  maxQueue?: number
  processLimit?: number
}

export async function POST(request: NextRequest) {
  if (!checkArchiveAdminToken(request)) {
    return NextResponse.json({ code: "FORBIDDEN", error: "invalid admin token" }, { status: 403 })
  }

  let payload: ScheduledPayload
  try {
    payload = await request.json()
  } catch {
    payload = {}
  }

  try {
    const dispatchSummary = await dispatchDueSyncRuns({
      dueMinutes: payload.dueMinutes,
      maxQueue: payload.maxQueue,
    })
    const backgroundSummary = await processQueuedSyncRuns({
      limit: payload.processLimit,
    })

    return NextResponse.json({
      code: "OK",
      data: {
        dispatch: dispatchSummary,
        background: backgroundSummary,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "scheduled chain failed"
    return NextResponse.json({ code: "SCHEDULED_FAILED", error: message }, { status: 500 })
  }
}
