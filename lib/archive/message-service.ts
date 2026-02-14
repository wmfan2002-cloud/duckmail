import { getMailboxById } from "@/lib/archive/mailbox-repository"
import { getMessageDetail, markMessageDeleted } from "@/lib/archive/message-repository"
import { mailTmCreateToken, mailTmDeleteMessage } from "@/lib/archive/mailtm-client"
import { appendSyncEvent, createSyncRun, finishSyncRun } from "@/lib/archive/sync-repository"

export type DeleteMode = "local" | "remote" | "both"

type DeleteResult = {
  auditRunId: number
  localDeleted: boolean
  messageId: number
  mode: DeleteMode
  remoteDeleted: boolean
  remoteErrorCode?: string
  remoteStatus?: number
  status: "success" | "partial" | "failed"
}

function mapRemoteErrorCode(error: unknown) {
  if (error && typeof error === "object") {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) {
      return "INVALID_CREDENTIALS"
    }
    if (status === 404) {
      return "REMOTE_NOT_FOUND"
    }
  }
  return "REMOTE_DELETE_FAILED"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error"
}

export async function deleteMessageByMode(messageId: number, mode: DeleteMode): Promise<DeleteResult> {
  const detail = await getMessageDetail(messageId)
  if (!detail) {
    throw new Error("message not found")
  }

  const run = await createSyncRun({
    mailboxId: detail.mailboxId,
    triggerType: "api-delete",
  })
  const runId = run.id

  let remoteDeleted = false
  let remoteStatus: number | undefined
  let remoteErrorCode: string | undefined
  let localDeleted = false

  try {
    await appendSyncEvent({
      runId,
      mailboxId: detail.mailboxId,
      code: "DELETE_BEGIN",
      message: "message delete requested",
      payload: {
        messageId,
        mode,
        remoteId: detail.remoteId,
      },
    })

    if (mode === "remote" || mode === "both") {
      const mailbox = await getMailboxById(detail.mailboxId, { revealCredential: true })
      if (!mailbox?.credential) {
        throw new Error("mailbox credential unavailable")
      }

      try {
        const token = await mailTmCreateToken({
          email: mailbox.email,
          password: mailbox.credential,
        })
        const remoteResult = await mailTmDeleteMessage(token, detail.remoteId)
        remoteDeleted = remoteResult.deleted
        remoteStatus = remoteResult.remoteStatus
      } catch (error) {
        remoteErrorCode = mapRemoteErrorCode(error)
        if (mode === "remote") {
          throw error
        }
      }
    }

    if (mode === "local" || mode === "both") {
      if (!detail.deletedAt) {
        const row = await markMessageDeleted(messageId)
        localDeleted = Boolean(row)
      }
    }

    const status: DeleteResult["status"] =
      remoteErrorCode && mode === "both"
        ? "partial"
        : remoteErrorCode && mode === "remote"
          ? "failed"
          : "success"

    await appendSyncEvent({
      runId,
      mailboxId: detail.mailboxId,
      code: status === "success" ? "DELETE_OK" : "DELETE_PARTIAL",
      level: status === "success" ? "info" : "warn",
      message: "message delete completed",
      payload: {
        messageId,
        mode,
        remoteDeleted,
        remoteStatus,
        remoteErrorCode,
        localDeleted,
      },
    })

    await finishSyncRun({
      runId,
      status: status === "failed" ? "failed" : "success",
      errorMessage: status === "failed" ? remoteErrorCode : undefined,
      stats: {
        action: "delete-message",
        messageId,
        mode,
        remoteDeleted,
        localDeleted,
        remoteStatus,
        remoteErrorCode,
      },
    })

    return {
      auditRunId: runId,
      messageId,
      mode,
      localDeleted,
      remoteDeleted,
      remoteStatus,
      remoteErrorCode,
      status,
    }
  } catch (error) {
    const code = mapRemoteErrorCode(error)
    await appendSyncEvent({
      runId,
      mailboxId: detail.mailboxId,
      level: "error",
      code,
      message: errorMessage(error),
      payload: {
        messageId,
        mode,
      },
    })
    await finishSyncRun({
      runId,
      status: "failed",
      errorMessage: errorMessage(error),
      stats: {
        action: "delete-message",
        messageId,
        mode,
      },
    })
    throw error
  }
}
