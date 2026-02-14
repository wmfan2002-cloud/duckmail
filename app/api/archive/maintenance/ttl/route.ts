import { NextRequest, NextResponse } from "next/server"

import { checkArchiveAdminToken } from "@/lib/archive/admin-auth"
import { runTtlMaintenance } from "@/lib/archive/ttl-maintenance"

export const runtime = "nodejs"

type TtlPayload = {
  dryRun?: boolean
  limitPerMailbox?: number
  retentionDays?: number
}

export async function POST(request: NextRequest) {
  if (!checkArchiveAdminToken(request)) {
    return NextResponse.json({ code: "FORBIDDEN", error: "invalid admin token" }, { status: 403 })
  }

  let payload: TtlPayload
  try {
    payload = await request.json()
  } catch {
    payload = {}
  }

  try {
    const summary = await runTtlMaintenance({
      dryRun: payload.dryRun,
      retentionDays: payload.retentionDays,
      limitPerMailbox: payload.limitPerMailbox,
    })
    return NextResponse.json({
      code: "OK",
      data: summary,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "ttl maintenance failed"
    return NextResponse.json({ code: "TTL_FAILED", error: message }, { status: 500 })
  }
}
