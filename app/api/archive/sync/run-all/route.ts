import { NextRequest, NextResponse } from "next/server"

import { ensureArchiveInternalPollerStarted } from "@/lib/archive/internal-poller"
import { getSyncSchedulerSettings } from "@/lib/archive/scheduler-settings"
import { enqueueSyncRuns, filterRunnableMailboxIds, listActiveMailboxIds } from "@/lib/archive/sync-repository"
import { processQueuedSyncRuns } from "@/lib/archive/sync-worker"

export const runtime = "nodejs"

type RunAllPayload = {
  mailboxIds?: number[]
  processLimit?: number
}

function normalizeMailboxIds(raw: unknown) {
  if (!Array.isArray(raw)) {
    return undefined
  }
  const ids = raw.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
  return ids.length > 0 ? Array.from(new Set(ids)) : undefined
}

function normalizeProcessLimit(raw: unknown, fallback: number) {
  if (raw === undefined || raw === null) {
    return fallback
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed)) {
    return fallback
  }
  return Math.max(1, Math.min(200, parsed))
}

export async function POST(request: NextRequest) {
  ensureArchiveInternalPollerStarted()

  let payload: RunAllPayload
  try {
    payload = await request.json()
  } catch {
    payload = {}
  }

  try {
    const requestedMailboxIds = normalizeMailboxIds(payload.mailboxIds)
    const activeMailboxIds = await listActiveMailboxIds({
      mailboxIds: requestedMailboxIds,
    })

    if (activeMailboxIds.length === 0) {
      return NextResponse.json({
        code: "OK",
        data: {
          requestedMailboxCount: 0,
          queuedCount: 0,
          skippedInFlight: 0,
          queuedRunIds: [],
        },
      })
    }

    const runnableMailboxIds = await filterRunnableMailboxIds(activeMailboxIds)
    const skippedInFlight = activeMailboxIds.length - runnableMailboxIds.length

    const queued = runnableMailboxIds.length > 0 ? await enqueueSyncRuns(runnableMailboxIds, "manual_full") : []

    const scheduler = await getSyncSchedulerSettings()
    const processLimit = normalizeProcessLimit(payload.processLimit, scheduler.processLimit)
    if (queued.length > 0) {
      void processQueuedSyncRuns({ limit: processLimit }).catch((error) => {
        const message = error instanceof Error ? error.message : "unknown run-all background error"
        console.error("[archive][run-all] processQueuedSyncRuns failed:", message)
      })
    }

    return NextResponse.json({
      code: "OK",
      data: {
        requestedMailboxCount: activeMailboxIds.length,
        queuedCount: queued.length,
        skippedInFlight,
        queuedRunIds: queued.map((item) => item.id),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "run all failed"
    return NextResponse.json({ code: "RUN_ALL_FAILED", error: message }, { status: 500 })
  }
}
