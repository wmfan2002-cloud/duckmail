import { eq } from "drizzle-orm"

import { archiveSettings } from "@/db/schema"
import { getArchiveDb } from "@/lib/archive/db"
import { assertArchiveRuntimeReady } from "@/lib/archive/runtime"

const SCHEDULER_KEY = "sync_scheduler"

const DEFAULT_SETTINGS = {
  enabled: true,
  intervalMinutes: 30 as 30 | 60,
  lastTriggeredAt: null as string | null,
  maxQueue: 30,
  processLimit: 20,
}

type SchedulerPayload = {
  enabled: boolean
  intervalMinutes: 30 | 60
  lastTriggeredAt: string | null
  maxQueue: number
  processLimit: number
}

export type SyncSchedulerSettings = SchedulerPayload & {
  updatedAt: string
}

type UpdateSchedulerSettingsInput = Partial<{
  enabled: boolean
  intervalMinutes: number
  lastTriggeredAt: string | null
  maxQueue: number
  processLimit: number
}>

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  const normalized = Math.floor(value)
  if (normalized < min) {
    return min
  }
  if (normalized > max) {
    return max
  }
  return normalized
}

function normalizeIntervalMinutes(value: unknown): 30 | 60 {
  return Number(value) === 60 ? 60 : 30
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}

function normalizePayload(value: Record<string, unknown> | null | undefined): SchedulerPayload {
  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
    intervalMinutes: normalizeIntervalMinutes(value?.intervalMinutes),
    lastTriggeredAt: normalizeIsoDate(value?.lastTriggeredAt),
    maxQueue: clampInt(Number(value?.maxQueue ?? DEFAULT_SETTINGS.maxQueue), 1, 200),
    processLimit: clampInt(Number(value?.processLimit ?? DEFAULT_SETTINGS.processLimit), 1, 200),
  }
}

function toPublicSettings(payload: SchedulerPayload, updatedAt: Date): SyncSchedulerSettings {
  return {
    ...payload,
    updatedAt: updatedAt.toISOString(),
  }
}

async function ensureSchedulerRow() {
  const db = getArchiveDb()
  const [existing] = await db
    .select({
      key: archiveSettings.key,
      value: archiveSettings.value,
      updatedAt: archiveSettings.updatedAt,
    })
    .from(archiveSettings)
    .where(eq(archiveSettings.key, SCHEDULER_KEY))
    .limit(1)

  if (existing) {
    return existing
  }

  const now = new Date()
  const [inserted] = await db
    .insert(archiveSettings)
    .values({
      key: SCHEDULER_KEY,
      value: DEFAULT_SETTINGS,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({
      key: archiveSettings.key,
      value: archiveSettings.value,
      updatedAt: archiveSettings.updatedAt,
    })

  if (inserted) {
    return inserted
  }

  const [fallback] = await db
    .select({
      key: archiveSettings.key,
      value: archiveSettings.value,
      updatedAt: archiveSettings.updatedAt,
    })
    .from(archiveSettings)
    .where(eq(archiveSettings.key, SCHEDULER_KEY))
    .limit(1)

  if (!fallback) {
    throw new Error("sync scheduler settings row missing")
  }
  return fallback
}

export async function getSyncSchedulerSettings(): Promise<SyncSchedulerSettings> {
  assertArchiveRuntimeReady()
  const row = await ensureSchedulerRow()
  const payload = normalizePayload(row.value)
  return toPublicSettings(payload, row.updatedAt)
}

export async function updateSyncSchedulerSettings(
  input: UpdateSchedulerSettingsInput,
): Promise<SyncSchedulerSettings> {
  assertArchiveRuntimeReady()
  const row = await ensureSchedulerRow()
  const current = normalizePayload(row.value)
  const next: SchedulerPayload = {
    ...current,
    enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    intervalMinutes:
      typeof input.intervalMinutes === "number"
        ? normalizeIntervalMinutes(input.intervalMinutes)
        : current.intervalMinutes,
    maxQueue: typeof input.maxQueue === "number" ? clampInt(input.maxQueue, 1, 200) : current.maxQueue,
    processLimit:
      typeof input.processLimit === "number" ? clampInt(input.processLimit, 1, 200) : current.processLimit,
    lastTriggeredAt:
      input.lastTriggeredAt === null
        ? null
        : typeof input.lastTriggeredAt === "string"
          ? normalizeIsoDate(input.lastTriggeredAt)
          : current.lastTriggeredAt,
  }

  const now = new Date()
  const db = getArchiveDb()
  const [updated] = await db
    .update(archiveSettings)
    .set({
      value: next,
      updatedAt: now,
    })
    .where(eq(archiveSettings.key, SCHEDULER_KEY))
    .returning({
      value: archiveSettings.value,
      updatedAt: archiveSettings.updatedAt,
    })

  if (!updated) {
    throw new Error("failed to update sync scheduler settings")
  }

  return toPublicSettings(normalizePayload(updated.value), updated.updatedAt)
}
