import { NextRequest, NextResponse } from "next/server"

import { checkArchiveAdminToken } from "@/lib/archive/admin-auth"
import { ensureArchiveInternalPollerStarted } from "@/lib/archive/internal-poller"
import { runMailboxSync } from "@/lib/archive/sync-worker"

export const runtime = "nodejs"

type SyncPayload = {
  mailboxIds?: number[]
  maxPages?: number
  triggerType?: "manual" | "schedule" | "background"
}

function normalizeMailboxIds(raw: unknown) {
  if (!Array.isArray(raw)) {
    return undefined
  }
  const ids = raw.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
  return ids.length > 0 ? ids : undefined
}

export async function POST(request: NextRequest) {
  ensureArchiveInternalPollerStarted()
  if (!checkArchiveAdminToken(request)) {
    return NextResponse.json({ code: "FORBIDDEN", error: "invalid admin token" }, { status: 403 })
  }

  let payload: SyncPayload
  try {
    payload = await request.json()
  } catch {
    payload = {}
  }

  const triggerType = payload.triggerType || "manual"
  if (!["manual", "schedule", "background"].includes(triggerType)) {
    return NextResponse.json(
      { code: "INVALID_INPUT", error: "triggerType must be manual|schedule|background" },
      { status: 400 },
    )
  }

  try {
    const summary = await runMailboxSync({
      mailboxIds: normalizeMailboxIds(payload.mailboxIds),
      maxPages: payload.maxPages,
      triggerType,
    })
    return NextResponse.json({ code: "OK", data: summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : "sync worker failed"
    return NextResponse.json({ code: "SYNC_FAILED", error: message }, { status: 500 })
  }
}
