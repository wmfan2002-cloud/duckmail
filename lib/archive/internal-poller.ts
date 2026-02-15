import { getSyncSchedulerSettings, updateSyncSchedulerSettings } from "@/lib/archive/scheduler-settings"
import { dispatchDueSyncRuns, processQueuedSyncRuns } from "@/lib/archive/sync-worker"

type PollerState = {
  running: boolean
  started: boolean
  timer: ReturnType<typeof setInterval> | null
}

const DEFAULT_POLL_SECONDS = 60
const MIN_POLL_SECONDS = 10
const MAX_POLL_SECONDS = 300

function getPollerState() {
  const key = "__duckmailArchiveInternalPoller__"
  const globalScope = globalThis as typeof globalThis & { [key: string]: PollerState | undefined }
  if (!globalScope[key]) {
    globalScope[key] = {
      running: false,
      started: false,
      timer: null,
    }
  }
  return globalScope[key]
}

function isPollerEnabled() {
  const raw = (process.env.ARCHIVE_INTERNAL_POLLER_ENABLED || "").trim().toLowerCase()
  if (!raw) {
    return true
  }
  return raw !== "0" && raw !== "false" && raw !== "off"
}

function resolvePollIntervalMs() {
  const raw = Number(process.env.ARCHIVE_INTERNAL_POLL_SECONDS || DEFAULT_POLL_SECONDS)
  if (!Number.isFinite(raw) || Number.isNaN(raw)) {
    return DEFAULT_POLL_SECONDS * 1000
  }
  const normalized = Math.max(MIN_POLL_SECONDS, Math.min(MAX_POLL_SECONDS, Math.floor(raw)))
  return normalized * 1000
}

async function runSchedulerCycle() {
  const scheduler = await getSyncSchedulerSettings()
  if (!scheduler.enabled) {
    return
  }

  const now = new Date()
  if (scheduler.lastTriggeredAt) {
    const elapsedMs = now.getTime() - new Date(scheduler.lastTriggeredAt).getTime()
    const intervalMs = scheduler.intervalMinutes * 60 * 1000
    if (elapsedMs < intervalMs) {
      return
    }
  }

  await updateSyncSchedulerSettings({
    lastTriggeredAt: now.toISOString(),
  })

  const dispatchSummary = await dispatchDueSyncRuns({
    dueMinutes: scheduler.intervalMinutes,
    maxQueue: scheduler.maxQueue,
  })
  if (dispatchSummary.queuedCount === 0) {
    return
  }

  await processQueuedSyncRuns({
    limit: scheduler.processLimit,
  })
}

async function pollerTick() {
  const state = getPollerState()
  if (state.running) {
    return
  }

  state.running = true
  try {
    await runSchedulerCycle()
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown poller error"
    console.error("[archive][poller] cycle failed:", message)
  } finally {
    state.running = false
  }
}

export function ensureArchiveInternalPollerStarted() {
  const state = getPollerState()
  if (!isPollerEnabled() || state.started) {
    return
  }

  const intervalMs = resolvePollIntervalMs()
  state.timer = setInterval(() => {
    void pollerTick()
  }, intervalMs)
  state.started = true

  if (typeof state.timer.unref === "function") {
    state.timer.unref()
  }

  void pollerTick()
}
