import { and, eq, lte, sql } from "drizzle-orm"

import { mailboxes, messages } from "@/db/schema"
import { getArchiveDb } from "@/lib/archive/db"
import { deleteExpiredMessages } from "@/lib/archive/message-repository"
import { assertArchiveRuntimeReady } from "@/lib/archive/runtime"
import { appendSyncEvent, createSyncRun, finishSyncRun } from "@/lib/archive/sync-repository"

type TtlOptions = {
  dryRun?: boolean
  limitPerMailbox?: number
  retentionDays?: number
}

export async function runTtlMaintenance(options: TtlOptions = {}) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const retentionDays = Math.max(1, Math.min(3650, options.retentionDays || 7))
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const dryRun = Boolean(options.dryRun)
  const limitPerMailbox = options.limitPerMailbox || 20_000

  const mailboxRows = await db
    .select({ id: mailboxes.id, email: mailboxes.email })
    .from(mailboxes)
    .orderBy(mailboxes.id)

  const details: Array<{
    deletedCount: number
    mailboxId: number
    mailboxEmail: string
    runId: number
  }> = []

  for (const mailbox of mailboxRows) {
    const run = await createSyncRun({
      mailboxId: mailbox.id,
      triggerType: "ttl-maintenance",
    })
    const runId = run.id
    try {
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(eq(messages.mailboxId, mailbox.id), lte(messages.receivedAt, cutoff)))

      const deletedCount = dryRun
        ? total || 0
        : (
            await deleteExpiredMessages({
              mailboxId: mailbox.id,
              cutoff,
              limitPerMailbox,
            })
          ).deletedCount

      await appendSyncEvent({
        runId,
        mailboxId: mailbox.id,
        code: dryRun ? "TTL_DRY_RUN" : "TTL_DELETE",
        message: dryRun ? "ttl dry run completed" : "ttl cleanup completed",
        payload: {
          cutoff: cutoff.toISOString(),
          deletedCount,
          retentionDays,
          dryRun,
        },
      })
      await finishSyncRun({
        runId,
        status: "success",
        stats: {
          action: "ttl-maintenance",
          cutoff: cutoff.toISOString(),
          deletedCount,
          retentionDays,
          dryRun,
        },
      })

      details.push({
        runId,
        mailboxId: mailbox.id,
        mailboxEmail: mailbox.email,
        deletedCount,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "ttl maintenance failed"
      await appendSyncEvent({
        runId,
        mailboxId: mailbox.id,
        level: "error",
        code: "TTL_FAILED",
        message,
      })
      await finishSyncRun({
        runId,
        status: "failed",
        errorMessage: message,
        stats: {
          action: "ttl-maintenance",
          cutoff: cutoff.toISOString(),
          retentionDays,
          dryRun,
        },
      })

      details.push({
        runId,
        mailboxId: mailbox.id,
        mailboxEmail: mailbox.email,
        deletedCount: 0,
      })
    }
  }

  return {
    dryRun,
    retentionDays,
    cutoff: cutoff.toISOString(),
    mailboxCount: mailboxRows.length,
    deletedCount: details.reduce((sum, item) => sum + item.deletedCount, 0),
    details,
  }
}
