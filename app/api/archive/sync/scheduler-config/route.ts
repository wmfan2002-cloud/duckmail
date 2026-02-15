import { NextRequest, NextResponse } from "next/server"

import { ensureArchiveInternalPollerStarted } from "@/lib/archive/internal-poller"
import { getSyncSchedulerSettings, updateSyncSchedulerSettings } from "@/lib/archive/scheduler-settings"

export const runtime = "nodejs"

type SchedulerConfigPayload = {
  enabled?: boolean
  intervalMinutes?: number
  maxQueue?: number
  processLimit?: number
}

export async function GET() {
  ensureArchiveInternalPollerStarted()
  try {
    const settings = await getSyncSchedulerSettings()
    return NextResponse.json({ code: "OK", data: settings })
  } catch (error) {
    const message = error instanceof Error ? error.message : "load scheduler config failed"
    return NextResponse.json({ code: "SCHEDULER_CONFIG_FAILED", error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  ensureArchiveInternalPollerStarted()
  let payload: SchedulerConfigPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ code: "INVALID_JSON", error: "invalid JSON payload" }, { status: 400 })
  }

  if (payload.intervalMinutes !== undefined && payload.intervalMinutes !== 30 && payload.intervalMinutes !== 60) {
    return NextResponse.json(
      { code: "INVALID_INPUT", error: "intervalMinutes must be 30 or 60" },
      { status: 400 },
    )
  }

  if (payload.maxQueue !== undefined && (!Number.isInteger(payload.maxQueue) || payload.maxQueue < 1 || payload.maxQueue > 200)) {
    return NextResponse.json(
      { code: "INVALID_INPUT", error: "maxQueue must be integer between 1 and 200" },
      { status: 400 },
    )
  }

  if (
    payload.processLimit !== undefined &&
    (!Number.isInteger(payload.processLimit) || payload.processLimit < 1 || payload.processLimit > 200)
  ) {
    return NextResponse.json(
      { code: "INVALID_INPUT", error: "processLimit must be integer between 1 and 200" },
      { status: 400 },
    )
  }

  try {
    const settings = await updateSyncSchedulerSettings(payload)
    return NextResponse.json({ code: "OK", data: settings })
  } catch (error) {
    const message = error instanceof Error ? error.message : "update scheduler config failed"
    return NextResponse.json({ code: "SCHEDULER_CONFIG_UPDATE_FAILED", error: message }, { status: 500 })
  }
}
