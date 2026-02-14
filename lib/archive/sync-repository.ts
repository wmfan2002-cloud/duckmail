import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm"

import { mailboxes, messages, syncEvents, syncRuns } from "@/db/schema"
import { decryptCredential } from "@/lib/archive/crypto"
import { getArchiveDb } from "@/lib/archive/db"
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
  const filter = and(
    eq(mailboxes.isActive, true),
    or(isNull(mailboxes.lastSyncAt), lt(mailboxes.lastSyncAt, dueBefore)),
  )
  const query = db
    .select({
      id: mailboxes.id,
    })
    .from(mailboxes)
    .where(filter)
    .orderBy(desc(mailboxes.updatedAt))

  const rows = options.limit && options.limit > 0 ? await query.limit(options.limit) : await query
  return rows.map((row) => row.id)
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
