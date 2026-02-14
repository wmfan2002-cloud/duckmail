import {
  and,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  or,
  SQL,
  sql,
} from "drizzle-orm"

import { mailboxes, messages } from "@/db/schema"
import { getArchiveDb } from "@/lib/archive/db"
import { assertArchiveRuntimeReady } from "@/lib/archive/runtime"

type SearchMessagesParams = {
  domain?: string
  end?: Date
  from?: string
  includeDeleted?: boolean
  mailbox?: string
  page?: number
  pageSize?: number
  q?: string
  start?: Date
  subject?: string
}

type SearchMessageItem = {
  bodyText: string | null
  fromAddress: string | null
  id: number
  mailboxEmail: string
  mailboxId: number
  receivedAt: Date | null
  remoteId: string
  snippet: string | null
  subject: string | null
}

type MessageDetail = SearchMessageItem & {
  bodyHtml: string | null
  deletedAt: Date | null
  provider: string
}

function normalizeLike(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? `%${trimmed}%` : undefined
}

function normalizeDomain(domain?: string) {
  const trimmed = domain?.trim().toLowerCase()
  if (!trimmed) {
    return undefined
  }
  return `%@${trimmed}`
}

function buildFilters(params: SearchMessagesParams) {
  const filters: SQL[] = []
  const mailboxLike = normalizeLike(params.mailbox)
  const domainLike = normalizeDomain(params.domain)
  const fromLike = normalizeLike(params.from)
  const subjectLike = normalizeLike(params.subject)
  const qLike = normalizeLike(params.q)

  if (!params.includeDeleted) {
    filters.push(isNull(messages.deletedAt))
  }
  if (mailboxLike) {
    filters.push(ilike(mailboxes.email, mailboxLike))
  }
  if (domainLike) {
    filters.push(ilike(mailboxes.email, domainLike))
  }
  if (fromLike) {
    filters.push(ilike(messages.fromAddress, fromLike))
  }
  if (subjectLike) {
    filters.push(ilike(messages.subject, subjectLike))
  }
  if (qLike) {
    filters.push(or(ilike(messages.subject, qLike), ilike(messages.snippet, qLike), ilike(messages.bodyText, qLike))!)
  }
  if (params.start) {
    filters.push(gte(messages.receivedAt, params.start))
  }
  if (params.end) {
    filters.push(lte(messages.receivedAt, params.end))
  }

  return filters
}

export async function searchMessages(params: SearchMessagesParams) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()

  const pageSize = Math.max(1, Math.min(100, params.pageSize || 50))
  const page = Math.max(1, params.page || 1)
  const offset = (page - 1) * pageSize
  const filters = buildFilters(params)

  const whereClause = filters.length > 0 ? and(...filters) : undefined
  const query = db
    .select({
      id: messages.id,
      mailboxId: messages.mailboxId,
      mailboxEmail: mailboxes.email,
      remoteId: messages.remoteId,
      subject: messages.subject,
      fromAddress: messages.fromAddress,
      snippet: messages.snippet,
      bodyText: messages.bodyText,
      receivedAt: messages.receivedAt,
    })
    .from(messages)
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
    .orderBy(desc(messages.receivedAt), desc(messages.id))
    .limit(pageSize)
    .offset(offset)

  const rows = whereClause ? await query.where(whereClause) : await query
  const totalQuery = db
    .select({ total: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
  const totalResult = whereClause ? await totalQuery.where(whereClause) : await totalQuery

  return {
    page,
    pageSize,
    total: totalResult[0]?.total || 0,
    items: rows as SearchMessageItem[],
  }
}

export async function getMessageDetail(messageId: number): Promise<MessageDetail | null> {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const [row] = await db
    .select({
      id: messages.id,
      mailboxId: messages.mailboxId,
      mailboxEmail: mailboxes.email,
      provider: mailboxes.provider,
      remoteId: messages.remoteId,
      subject: messages.subject,
      fromAddress: messages.fromAddress,
      snippet: messages.snippet,
      bodyText: messages.bodyText,
      bodyHtml: messages.bodyHtml,
      receivedAt: messages.receivedAt,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
    .where(eq(messages.id, messageId))
    .limit(1)

  return (row as MessageDetail | undefined) || null
}

export async function markMessageDeleted(messageId: number, deletedAt = new Date()) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const [row] = await db
    .update(messages)
    .set({
      deletedAt,
      updatedAt: deletedAt,
    })
    .where(eq(messages.id, messageId))
    .returning({
      id: messages.id,
      deletedAt: messages.deletedAt,
      mailboxId: messages.mailboxId,
      remoteId: messages.remoteId,
    })
  return row ?? null
}
