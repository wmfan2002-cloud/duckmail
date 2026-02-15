import { NextRequest, NextResponse } from "next/server"

import { checkArchiveAdminToken } from "@/lib/archive/admin-auth"
import { getSyncSchedulerSettings, updateSyncSchedulerSettings } from "@/lib/archive/scheduler-settings"
import { dispatchDueSyncRuns, processQueuedSyncRuns } from "@/lib/archive/sync-worker"

export const runtime = "nodejs"

type ScheduledPayload = {
  dueMinutes?: number
  force?: boolean
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
    const scheduler = await getSyncSchedulerSettings()
    const force = payload.force === true
    const now = new Date()

    if (!force && !scheduler.enabled) {
      return NextResponse.json({
        code: "OK",
        data: {
          skipped: true,
          reason: "SCHEDULER_DISABLED",
          scheduler,
        },
      })
    }

    if (!force && scheduler.lastTriggeredAt) {
      const lastTriggeredAt = new Date(scheduler.lastTriggeredAt)
      const elapsedMs = now.getTime() - lastTriggeredAt.getTime()
      const intervalMs = scheduler.intervalMinutes * 60 * 1000
      if (elapsedMs < intervalMs) {
        return NextResponse.json({
          code: "OK",
          data: {
            skipped: true,
            reason: "INTERVAL_NOT_REACHED",
            nextRunAt: new Date(lastTriggeredAt.getTime() + intervalMs).toISOString(),
            scheduler,
          },
        })
      }
    }

    const dueMinutes = payload.dueMinutes || scheduler.intervalMinutes
    const maxQueue = payload.maxQueue || scheduler.maxQueue
    const processLimit = payload.processLimit || scheduler.processLimit

    const updatedScheduler = await updateSyncSchedulerSettings({
      lastTriggeredAt: now.toISOString(),
    })

    const dispatchSummary = await dispatchDueSyncRuns({
      dueMinutes,
      maxQueue,
    })
    const backgroundSummary = await processQueuedSyncRuns({
      limit: processLimit,
    })

    return NextResponse.json({
      code: "OK",
      data: {
        skipped: false,
        scheduler: updatedScheduler,
        dispatch: dispatchSummary,
        background: backgroundSummary,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "scheduled chain failed"
    return NextResponse.json({ code: "SCHEDULED_FAILED", error: message }, { status: 500 })
  }
}
