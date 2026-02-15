import { and, desc, eq, gte, inArray } from "drizzle-orm"

import { mailboxes, messages, syncEvents, syncRuns } from "@/db/schema"
import { decryptCredential } from "@/lib/archive/crypto"
import { getArchiveDb } from "@/lib/archive/db"
import { buildSyncMetrics } from "@/lib/archive/metrics"
import { assertArchiveRuntimeReady } from "@/lib/archive/runtime"

type SyncMailbox = {
  credential: string
  email: string
  id: number
  provider: string
}

type CreateSyncRunInput = {
  mailboxId: number
  triggerType: string
  status?: string
  startedAt?: Date | null
}

type FinishSyncRunInput = {
  errorMessage?: string
  runId: number
  stats?: Record<string, unknown>
  status: "success" | "failed"
}

type QueueRun = {
  id: number
  mailboxId: number
  triggerType: string
}

type SyncEventInput = {
  code?: string
  level?: "info" | "warn" | "error"
  mailboxId: number
  message: string
  payload?: Record<string, unknown>
  runId: number
}

type UpsertMessageInput = {
  bodyHtml?: string | null
  bodyText?: string | null
  fromAddress?: string | null
  receivedAt?: Date | null
  remoteId: string
  snippet?: string | null
  subject?: string | null
  toAddresses?: string[] | null
}

export async function listSyncMailboxes(options: { mailboxIds?: number[]; limit?: number } = {}) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()

  const filter =
    options.mailboxIds && options.mailboxIds.length > 0
      ? and(eq(mailboxes.isActive, true), inArray(mailboxes.id, options.mailboxIds))
      : eq(mailboxes.isActive, true)

  const query = db
    .select({
      id: mailboxes.id,
      email: mailboxes.email,
      provider: mailboxes.provider,
      passwordEnc: mailboxes.passwordEnc,
    })
    .from(mailboxes)
    .where(filter)
    .orderBy(desc(mailboxes.updatedAt))

  const rows = options.limit && options.limit > 0 ? await query.limit(options.limit) : await query
  return rows.map<SyncMailbox>((row) => ({
    id: row.id,
    email: row.email,
    provider: row.provider,
    credential: decryptCredential(row.passwordEnc),
  }))
}

export async function createSyncRun(input: CreateSyncRunInput) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const [row] = await db
    .insert(syncRuns)
    .values({
      mailboxId: input.mailboxId,
      triggerType: input.triggerType,
      status: input.status || "running",
      startedAt: input.startedAt === undefined ? new Date() : input.startedAt,
      createdAt: new Date(),
    })
    .returning({
      id: syncRuns.id,
      mailboxId: syncRuns.mailboxId,
    })

  return row
}

export async function listDueMailboxIds(options: { dueMinutes?: number; limit?: number } = {}) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const dueMinutes = options.dueMinutes || 10
  const dueBefore = new Date(Date.now() - dueMinutes * 60 * 1000)
  const rows = await db
    .select({
      id: mailboxes.id,
      lastSyncAt: mailboxes.lastSyncAt,
    })
    .from(mailboxes)
    .where(eq(mailboxes.isActive, true))

  const dueRows = rows
    .filter((row) => !row.lastSyncAt || row.lastSyncAt < dueBefore)
    .sort((a, b) => {
      const aTs = a.lastSyncAt ? new Date(a.lastSyncAt).getTime() : 0
      const bTs = b.lastSyncAt ? new Date(b.lastSyncAt).getTime() : 0
      if (aTs !== bTs) {
        return aTs - bTs
      }
      return a.id - b.id
    })

  const limited = options.limit && options.limit > 0 ? dueRows.slice(0, options.limit) : dueRows
  return limited.map((row) => row.id)
}

export async function enqueueSyncRuns(mailboxIds: number[], triggerType: string) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const queued: QueueRun[] = []
  for (const mailboxId of mailboxIds) {
    const [row] = await db
      .insert(syncRuns)
      .values({
        mailboxId,
        triggerType,
        status: "queued",
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
      })
      .returning({
        id: syncRuns.id,
        mailboxId: syncRuns.mailboxId,
        triggerType: syncRuns.triggerType,
      })
    queued.push(row)
  }
  return queued
}

export async function claimQueuedRuns(limit = 20) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const queuedRows = await db
    .select({
      id: syncRuns.id,
      mailboxId: syncRuns.mailboxId,
      triggerType: syncRuns.triggerType,
    })
    .from(syncRuns)
    .where(eq(syncRuns.status, "queued"))
    .orderBy(desc(syncRuns.createdAt))
    .limit(limit)

  const claimed: QueueRun[] = []
  for (const row of queuedRows) {
    const [updated] = await db
      .update(syncRuns)
      .set({
        status: "dispatching",
        startedAt: new Date(),
      })
      .where(and(eq(syncRuns.id, row.id), eq(syncRuns.status, "queued")))
      .returning({
        id: syncRuns.id,
        mailboxId: syncRuns.mailboxId,
        triggerType: syncRuns.triggerType,
      })
    if (updated) {
      claimed.push(updated)
    }
  }
  return claimed
}

export async function completeQueuedRun(input: {
  errorMessage?: string
  queueRunId: number
  stats?: Record<string, unknown>
  status: "completed" | "failed"
}) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const [row] = await db
    .update(syncRuns)
    .set({
      status: input.status,
      finishedAt: new Date(),
      errorMessage: input.errorMessage || null,
      stats: input.stats || null,
    })
    .where(eq(syncRuns.id, input.queueRunId))
    .returning({ id: syncRuns.id, status: syncRuns.status })
  return row ?? null
}

export async function finishSyncRun(input: FinishSyncRunInput) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const [row] = await db
    .update(syncRuns)
    .set({
      status: input.status,
      finishedAt: new Date(),
      errorMessage: input.errorMessage || null,
      stats: input.stats || null,
    })
    .where(eq(syncRuns.id, input.runId))
    .returning({
      id: syncRuns.id,
      status: syncRuns.status,
    })
  return row ?? null
}

export async function appendSyncEvent(input: SyncEventInput) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const [row] = await db
    .insert(syncEvents)
    .values({
      runId: input.runId,
      mailboxId: input.mailboxId,
      level: input.level || "info",
      code: input.code || null,
      message: input.message,
      payload: input.payload || null,
      createdAt: new Date(),
    })
    .returning({ id: syncEvents.id })
  return row
}

export async function upsertSyncMessage(mailboxId: number, message: UpsertMessageInput) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const now = new Date()
  const [row] = await db
    .insert(messages)
    .values({
      mailboxId,
      remoteId: message.remoteId,
      subject: message.subject || null,
      fromAddress: message.fromAddress || null,
      toAddresses: message.toAddresses || null,
      receivedAt: message.receivedAt || null,
      snippet: message.snippet || null,
      bodyText: message.bodyText || null,
      bodyHtml: message.bodyHtml || null,
      updatedAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [messages.mailboxId, messages.remoteId],
      set: {
        subject: message.subject || null,
        fromAddress: message.fromAddress || null,
        toAddresses: message.toAddresses || null,
        receivedAt: message.receivedAt || null,
        snippet: message.snippet || null,
        bodyText: message.bodyText || null,
        bodyHtml: message.bodyHtml || null,
        updatedAt: now,
      },
    })
    .returning({ id: messages.id })
  return row
}

export async function listRecentSyncRuns(limit = 20) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  return db
    .select({
      id: syncRuns.id,
      mailboxId: syncRuns.mailboxId,
      mailboxEmail: mailboxes.email,
      triggerType: syncRuns.triggerType,
      status: syncRuns.status,
      errorMessage: syncRuns.errorMessage,
      startedAt: syncRuns.startedAt,
      finishedAt: syncRuns.finishedAt,
      createdAt: syncRuns.createdAt,
      stats: syncRuns.stats,
    })
    .from(syncRuns)
    .innerJoin(mailboxes, eq(syncRuns.mailboxId, mailboxes.id))
    .orderBy(desc(syncRuns.createdAt))
    .limit(Math.max(1, Math.min(200, limit)))
}

export async function listRecentSyncErrors(limit = 50) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  return db
    .select({
      id: syncEvents.id,
      runId: syncEvents.runId,
      mailboxId: syncEvents.mailboxId,
      mailboxEmail: mailboxes.email,
      code: syncEvents.code,
      message: syncEvents.message,
      createdAt: syncEvents.createdAt,
      payload: syncEvents.payload,
    })
    .from(syncEvents)
    .innerJoin(mailboxes, eq(syncEvents.mailboxId, mailboxes.id))
    .where(eq(syncEvents.level, "error"))
    .orderBy(desc(syncEvents.createdAt))
    .limit(Math.max(1, Math.min(200, limit)))
}

export async function getSyncMetrics(options: {
  thresholdFailureRate?: number
  thresholdP95LatencyMs?: number
  windowHours?: number
} = {}) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const windowHours = options.windowHours || 24
  const thresholdFailureRate = options.thresholdFailureRate ?? 0.1
  const thresholdP95LatencyMs = options.thresholdP95LatencyMs ?? 5000
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000)

  const rows = await db
    .select({
      status: syncRuns.status,
      startedAt: syncRuns.startedAt,
      finishedAt: syncRuns.finishedAt,
    })
    .from(syncRuns)
    .where(gte(syncRuns.createdAt, since))

  const metrics = buildSyncMetrics(rows, {
    failureRate: thresholdFailureRate,
    p95LatencyMs: thresholdP95LatencyMs,
  })

  return {
    windowHours,
    since,
    thresholds: {
      failureRate: thresholdFailureRate,
      p95LatencyMs: thresholdP95LatencyMs,
    },
    ...metrics,
  }
}

export async function updateMailboxLastSyncAt(mailboxId: number, value = new Date()) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const [row] = await db
    .update(mailboxes)
    .set({
      lastSyncAt: value,
      updatedAt: value,
    })
    .where(eq(mailboxes.id, mailboxId))
    .returning({ id: mailboxes.id })
  return row ?? null
}
