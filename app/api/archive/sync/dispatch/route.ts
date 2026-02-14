import { NextRequest, NextResponse } from "next/server"

import { checkArchiveAdminToken } from "@/lib/archive/admin-auth"
import { dispatchDueSyncRuns } from "@/lib/archive/sync-worker"

export const runtime = "nodejs"

type DispatchPayload = {
  dueMinutes?: number
  maxQueue?: number
}

export async function POST(request: NextRequest) {
  if (!checkArchiveAdminToken(request)) {
    return NextResponse.json({ code: "FORBIDDEN", error: "invalid admin token" }, { status: 403 })
  }

  let payload: DispatchPayload
  try {
    payload = await request.json()
  } catch {
    payload = {}
  }

  try {
    const summary = await dispatchDueSyncRuns({
      dueMinutes: payload.dueMinutes,
      maxQueue: payload.maxQueue,
    })
    return NextResponse.json({
      code: "OK",
      data: summary,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "dispatch failed"
    return NextResponse.json({ code: "DISPATCH_FAILED", error: message }, { status: 500 })
  }
}
