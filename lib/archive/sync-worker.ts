import { mailTmCreateToken, mailTmGetMessageDetail, mailTmListMessages } from "@/lib/archive/mailtm-client"
import {
  appendSyncEvent,
  claimQueuedRuns,
  completeQueuedRun,
  createSyncRun,
  enqueueSyncRuns,
  finishSyncRun,
  listDueMailboxIds,
  listSyncMailboxes,
  updateMailboxLastSyncAt,
  upsertSyncMessage,
} from "@/lib/archive/sync-repository"

type SyncTriggerType = "manual" | "schedule" | "background"

type SyncOptions = {
  mailboxIds?: number[]
  // 0 表示不限制分页，按接口返回持续拉取到末页
  maxPages?: number
  triggerType?: SyncTriggerType
}

type SyncMailboxResult = {
  errorCode?: string
  errorMessage?: string
  fetched: number
  mailboxId: number
  runId?: number
  status: "success" | "failed"
  upserted: number
}

type SyncSummary = {
  total: number
  succeeded: number
  failed: number
  results: SyncMailboxResult[]
}

type DispatchSummary = {
  dueMailboxCount: number
  queuedCount: number
  queuedRunIds: number[]
}

type BackgroundSummary = {
  processed: number
  succeeded: number
  failed: number
  queueRunIds: number[]
}

const HARD_MAX_SYNC_PAGES = 500

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function createRequestGate(qpsLimit: number) {
  const intervalMs = Math.ceil(1000 / qpsLimit)
  let nextAvailableAt = Date.now()
  return async () => {
    const now = Date.now()
    const waitMs = Math.max(0, nextAvailableAt - now)
    nextAvailableAt = Math.max(now, nextAvailableAt) + intervalMs
    if (waitMs > 0) {
      await sleep(waitMs)
    }
  }
}

async function withRetries<T>(
  action: () => Promise<T>,
  options: {
    attempts: number
    onRetry?: (attempt: number, error: unknown) => Promise<void> | void
  },
) {
  let lastError: unknown
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await action()
    } catch (error) {
      lastError = error
      if (attempt >= options.attempts) {
        break
      }
      if (options.onRetry) {
        await options.onRetry(attempt, error)
      }
      await sleep(500 * 2 ** (attempt - 1))
    }
  }
  throw lastError
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function runOne() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index])
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runOne())
  await Promise.all(runners)
  return results
}

function resolveErrorCode(error: unknown) {
  if (error && typeof error === "object") {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) {
      return "INVALID_CREDENTIALS"
    }
  }
  return "SYNC_FAILED"
}

function resolveErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown sync error"
}

function normalizeMaxPages(value: number | string | undefined, fallback: number) {
  if (value === undefined || value === null || value === "") {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return fallback
  }
  if (parsed <= 0) {
    return 0
  }
  return clampInt(parsed, 1, HARD_MAX_SYNC_PAGES)
}

async function syncSingleMailbox(options: {
  gate: () => Promise<void>
  mailbox: {
    credential: string
    email: string
    id: number
    provider: string
  }
  maxPages: number
  triggerType: SyncTriggerType
}): Promise<SyncMailboxResult> {
  const run = await createSyncRun({
    mailboxId: options.mailbox.id,
    triggerType: options.triggerType,
  })

  const runId = run.id
  let fetched = 0
  let upserted = 0
  let scannedPages = 0

  try {
    await appendSyncEvent({
      runId,
      mailboxId: options.mailbox.id,
      message: "sync started",
      payload: {
        provider: options.mailbox.provider,
        triggerType: options.triggerType,
      },
    })

    const token = await withRetries(
      () =>
        mailTmCreateToken(
          {
            email: options.mailbox.email,
            password: options.mailbox.credential,
          },
          { beforeRequest: options.gate },
        ),
      {
        attempts: 3,
        onRetry: async (attempt, error) => {
          await appendSyncEvent({
            runId,
            mailboxId: options.mailbox.id,
            level: "warn",
            code: "TOKEN_RETRY",
            message: "retry provider token request",
            payload: {
              attempt,
              reason: resolveErrorMessage(error),
            },
          })
        },
      },
    )

    for (let page = 1; page <= HARD_MAX_SYNC_PAGES; page += 1) {
      if (options.maxPages > 0 && page > options.maxPages) {
        break
      }

      const summaries = await withRetries(
        () => mailTmListMessages(token, page, { beforeRequest: options.gate }),
        {
          attempts: 3,
          onRetry: async (attempt, error) => {
            await appendSyncEvent({
              runId,
              mailboxId: options.mailbox.id,
              level: "warn",
              code: "LIST_RETRY",
              message: "retry provider message list request",
              payload: {
                attempt,
                page,
                reason: resolveErrorMessage(error),
              },
            })
          },
        },
      )
      scannedPages += 1

      if (summaries.items.length === 0) {
        break
      }

      for (const summary of summaries.items) {
        const detail = await withRetries(
          () => mailTmGetMessageDetail(token, summary.id, { beforeRequest: options.gate }),
          {
            attempts: 3,
            onRetry: async (attempt, error) => {
              await appendSyncEvent({
                runId,
                mailboxId: options.mailbox.id,
                level: "warn",
                code: "DETAIL_RETRY",
                message: "retry provider message detail request",
                payload: {
                  attempt,
                  remoteId: summary.id,
                  reason: resolveErrorMessage(error),
                },
              })
            },
          },
        )

        fetched += 1
        await upsertSyncMessage(options.mailbox.id, {
          remoteId: detail.id,
          subject: detail.subject || null,
          snippet: detail.intro || null,
          fromAddress: detail.from?.address || null,
          toAddresses: detail.to?.map((item) => item.address || "").filter(Boolean) || null,
          receivedAt: detail.createdAt ? new Date(detail.createdAt) : null,
          bodyText: detail.text || null,
          bodyHtml: detail.html?.join("\n") || null,
        })
        upserted += 1
      }

      if (!summaries.hasNext) {
        break
      }
    }

    if (scannedPages >= HARD_MAX_SYNC_PAGES) {
      await appendSyncEvent({
        runId,
        mailboxId: options.mailbox.id,
        level: "warn",
        code: "PAGE_GUARD_LIMIT",
        message: "sync stopped by hard page guard limit",
        payload: {
          hardLimit: HARD_MAX_SYNC_PAGES,
          requestedMaxPages: options.maxPages,
        },
      })
    }

    await finishSyncRun({
      runId,
      status: "success",
      stats: {
        fetched,
        scannedPages,
        upserted,
      },
    })

    await appendSyncEvent({
      runId,
      mailboxId: options.mailbox.id,
      code: "SYNC_OK",
      message: "sync finished",
      payload: {
        fetched,
        scannedPages,
        upserted,
      },
    })
    await updateMailboxLastSyncAt(options.mailbox.id)

    return {
      mailboxId: options.mailbox.id,
      runId,
      status: "success",
      fetched,
      upserted,
    }
  } catch (error) {
    const errorCode = resolveErrorCode(error)
    const errorMessage = resolveErrorMessage(error)
    await finishSyncRun({
      runId,
      status: "failed",
      errorMessage,
      stats: {
        fetched,
        scannedPages,
        upserted,
      },
    })
    await appendSyncEvent({
      runId,
      mailboxId: options.mailbox.id,
      level: "error",
      code: errorCode,
      message: errorMessage,
    })

    return {
      mailboxId: options.mailbox.id,
      runId,
      status: "failed",
      fetched,
      upserted,
      errorCode,
      errorMessage,
    }
  }
}

function resolveSyncConfig() {
  const qps = clampInt(Number(process.env.ARCHIVE_SYNC_QPS || 6), 1, 6)
  const concurrency = clampInt(Number(process.env.ARCHIVE_SYNC_CONCURRENCY || 3), 3, 4)
  const maxPages = normalizeMaxPages(process.env.ARCHIVE_SYNC_MAX_PAGES, 0)
  return {
    qps,
    concurrency,
    maxPages,
  }
}

export async function runMailboxSync(options: SyncOptions = {}): Promise<SyncSummary> {
  const config = resolveSyncConfig()
  const triggerType = options.triggerType || "manual"
  const mailboxes = await listSyncMailboxes({
    mailboxIds: options.mailboxIds,
  })
  const gate = createRequestGate(config.qps)
  const maxPages = normalizeMaxPages(options.maxPages, config.maxPages)

  const results = await runWithConcurrency(mailboxes, config.concurrency, async (mailbox) =>
    syncSingleMailbox({
      gate,
      mailbox,
      triggerType,
      maxPages,
    }),
  )

  const succeeded = results.filter((item) => item.status === "success").length
  const failed = results.length - succeeded
  return {
    total: results.length,
    succeeded,
    failed,
    results,
  }
}

export async function dispatchDueSyncRuns(options: { dueMinutes?: number; maxQueue?: number } = {}) {
  const maxQueue = clampInt(Number(options.maxQueue || 30), 1, 200)
  const dueMailboxIds = await listDueMailboxIds({
    dueMinutes: options.dueMinutes || 10,
    limit: maxQueue,
  })
  if (dueMailboxIds.length === 0) {
    return {
      dueMailboxCount: 0,
      queuedCount: 0,
      queuedRunIds: [],
    } satisfies DispatchSummary
  }

  const queued = await enqueueSyncRuns(dueMailboxIds, "schedule")
  return {
    dueMailboxCount: dueMailboxIds.length,
    queuedCount: queued.length,
    queuedRunIds: queued.map((item) => item.id),
  } satisfies DispatchSummary
}

export async function processQueuedSyncRuns(options: { limit?: number } = {}) {
  const limit = clampInt(Number(options.limit || 20), 1, 200)
  const claimed = await claimQueuedRuns(limit)
  if (claimed.length === 0) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      queueRunIds: [],
    } satisfies BackgroundSummary
  }

  let succeeded = 0
  let failed = 0
  for (const queueRun of claimed) {
    try {
      const summary = await runMailboxSync({
        mailboxIds: [queueRun.mailboxId],
        triggerType: "background",
      })
      const result = summary.results[0]
      if (result?.status === "success") {
        succeeded += 1
        await completeQueuedRun({
          queueRunId: queueRun.id,
          status: "completed",
          stats: {
            workerRunId: result.runId,
            fetched: result.fetched,
            upserted: result.upserted,
          },
        })
      } else {
        failed += 1
        await completeQueuedRun({
          queueRunId: queueRun.id,
          status: "failed",
          errorMessage: result?.errorMessage || "background sync failed",
          stats: {
            workerRunId: result?.runId,
            errorCode: result?.errorCode,
          },
        })
      }
    } catch (error) {
      failed += 1
      const message = resolveErrorMessage(error)
      await completeQueuedRun({
        queueRunId: queueRun.id,
        status: "failed",
        errorMessage: message,
      })
    }
  }

  return {
    processed: claimed.length,
    succeeded,
    failed,
    queueRunIds: claimed.map((item) => item.id),
  } satisfies BackgroundSummary
}
