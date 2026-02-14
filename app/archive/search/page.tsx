"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { AlertCircle, ArrowLeft, Eye, Loader2, RefreshCw, Search, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type MessageItem = {
  bodyText: string | null
  fromAddress: string | null
  id: number
  mailboxEmail: string
  mailboxId: number
  receivedAt: string | null
  remoteId: string
  snippet: string | null
  subject: string | null
}

type MessageDetail = MessageItem & {
  bodyHtml: string | null
  deletedAt: string | null
  provider: string
}

type MessageSearchResponse = {
  code: string
  data?: {
    items: MessageItem[]
    page: number
    pageSize: number
    total: number
  }
  error?: string
}

type SyncRunsResponse = {
  code: string
  data?: {
    errors: Array<{
      code: string | null
      createdAt: string
      id: number
      mailboxEmail: string
      message: string
      runId: number
    }>
    runs: Array<{
      createdAt: string
      errorMessage: string | null
      id: number
      mailboxEmail: string
      status: string
      triggerType: string
    }>
  }
  error?: string
}

const DEFAULT_PAGE_SIZE = 30

export default function ArchiveSearchPage() {
  const [filters, setFilters] = useState({
    mailbox: "",
    domain: "",
    from: "",
    subject: "",
    q: "",
    start: "",
    end: "",
  })
  const [page, setPage] = useState(1)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState("")
  const [listData, setListData] = useState<MessageSearchResponse["data"]>()

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState("")
  const [detail, setDetail] = useState<MessageDetail | null>(null)

  const [deleteMode, setDeleteMode] = useState<"local" | "remote" | "both">("both")
  const [deletingIds, setDeletingIds] = useState<number[]>([])

  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState("")
  const [runsData, setRunsData] = useState<SyncRunsResponse["data"]>()

  useEffect(() => {
    void loadMessages(1)
    void loadSyncRuns()
  }, [])

  const totalPages = useMemo(() => {
    const total = listData?.total || 0
    return Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE))
  }, [listData?.total])

  function buildSearchParams(targetPage: number) {
    const searchParams = new URLSearchParams()
    searchParams.set("page", String(targetPage))
    searchParams.set("pageSize", String(DEFAULT_PAGE_SIZE))
    for (const [key, value] of Object.entries(filters)) {
      const trimmed = value.trim()
      if (trimmed) {
        searchParams.set(key, trimmed)
      }
    }
    return searchParams.toString()
  }

  async function loadMessages(targetPage = page) {
    setListLoading(true)
    setListError("")
    try {
      const response = await fetch(`/api/archive/messages?${buildSearchParams(targetPage)}`)
      const payload = (await response.json()) as MessageSearchResponse
      if (!response.ok || payload.code !== "OK" || !payload.data) {
        throw new Error(payload.error || payload.code || "检索失败")
      }
      setListData(payload.data)
      setPage(payload.data.page)
    } catch (error) {
      const message = error instanceof Error ? error.message : "检索失败"
      setListError(message)
    } finally {
      setListLoading(false)
    }
  }

  async function loadSyncRuns() {
    setRunsLoading(true)
    setRunsError("")
    try {
      const response = await fetch("/api/archive/sync/runs?limit=12&errorLimit=12")
      const payload = (await response.json()) as SyncRunsResponse
      if (!response.ok || payload.code !== "OK" || !payload.data) {
        throw new Error(payload.error || payload.code || "同步记录获取失败")
      }
      setRunsData(payload.data)
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步记录获取失败"
      setRunsError(message)
    } finally {
      setRunsLoading(false)
    }
  }

  async function openDetail(messageId: number) {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailError("")
    setDetail(null)
    try {
      const response = await fetch(`/api/archive/messages/${messageId}`)
      const payload = (await response.json()) as { code?: string; data?: MessageDetail; error?: string }
      if (!response.ok || payload.code !== "OK" || !payload.data) {
        throw new Error(payload.error || payload.code || "详情加载失败")
      }
      setDetail(payload.data)
    } catch (error) {
      const message = error instanceof Error ? error.message : "详情加载失败"
      setDetailError(message)
    } finally {
      setDetailLoading(false)
    }
  }

  async function deleteMessage(messageId: number) {
    setDeletingIds((prev) => [...prev, messageId])
    try {
      const response = await fetch(`/api/archive/messages/${messageId}?mode=${deleteMode}`, { method: "DELETE" })
      const payload = (await response.json()) as { code?: string; error?: string }
      if (!response.ok || (payload.code !== "DELETE_OK" && payload.code !== "DELETE_PARTIAL")) {
        throw new Error(payload.error || payload.code || "删除失败")
      }

      // 立即刷新，同时保留 1 秒延迟二次刷新，满足状态回显与 eventual consistency
      await loadMessages(page)
      setTimeout(() => {
        void loadMessages(page)
      }, 1000)
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除失败"
      setListError(message)
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== messageId))
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        <section className="space-y-4 rounded-2xl border border-violet-500/30 bg-slate-900/80 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-violet-300/80">Archive Search</p>
              <h1 className="mt-2 text-2xl font-semibold">归档检索与删除面板</h1>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/archive">
                  <ArrowLeft className="h-4 w-4" />
                  返回邮箱管理
                </Link>
              </Button>
              <Button variant="outline" onClick={() => void loadMessages(page)} disabled={listLoading}>
                {listLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                刷新
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input
              placeholder="mailbox"
              value={filters.mailbox}
              onChange={(event) => setFilters((prev) => ({ ...prev, mailbox: event.target.value }))}
            />
            <Input
              placeholder="domain"
              value={filters.domain}
              onChange={(event) => setFilters((prev) => ({ ...prev, domain: event.target.value }))}
            />
            <Input
              placeholder="from"
              value={filters.from}
              onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
            />
            <Input
              placeholder="subject"
              value={filters.subject}
              onChange={(event) => setFilters((prev) => ({ ...prev, subject: event.target.value }))}
            />
            <Input
              placeholder="q (full-text fallback)"
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
            />
            <div className="flex items-center gap-2">
              <select
                className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
                value={deleteMode}
                onChange={(event) => setDeleteMode(event.target.value as "local" | "remote" | "both")}
              >
                <option value="both">delete mode: both</option>
                <option value="local">delete mode: local</option>
                <option value="remote">delete mode: remote</option>
              </select>
              <Button
                onClick={() => {
                  setPage(1)
                  void loadMessages(1)
                }}
              >
                <Search className="h-4 w-4" />
                检索
              </Button>
            </div>
            <Input
              type="datetime-local"
              value={filters.start}
              onChange={(event) => setFilters((prev) => ({ ...prev, start: event.target.value }))}
            />
            <Input
              type="datetime-local"
              value={filters.end}
              onChange={(event) => setFilters((prev) => ({ ...prev, end: event.target.value }))}
            />
          </div>

          {listError ? (
            <div className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              <AlertCircle className="h-4 w-4" />
              {listError}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-md border border-slate-700">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Mailbox</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listData?.items || []).map((item) => {
                  const deleting = deletingIds.includes(item.id)
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.id}</TableCell>
                      <TableCell className="text-xs">{item.mailboxEmail}</TableCell>
                      <TableCell className="text-xs">{item.fromAddress || "-"}</TableCell>
                      <TableCell className="max-w-[240px] truncate">{item.subject || "-"}</TableCell>
                      <TableCell className="text-xs">{item.receivedAt || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => void openDetail(item.id)}>
                            <Eye className="h-4 w-4" />
                            详情
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void deleteMessage(item.id)}
                            disabled={deleting}
                          >
                            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => {
              const next = Math.max(1, page - 1)
              setPage(next)
              void loadMessages(next)
            }}>
              上一页
            </Button>
            <span className="inline-flex items-center text-sm text-slate-300">
              {page}/{totalPages}
            </span>
            <Button variant="outline" disabled={page >= totalPages} onClick={() => {
              const next = Math.min(totalPages, page + 1)
              setPage(next)
              void loadMessages(next)
            }}>
              下一页
            </Button>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">同步记录与错误日志</h2>
            <Button variant="outline" size="sm" onClick={() => void loadSyncRuns()} disabled={runsLoading}>
              {runsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </Button>
          </div>
          {runsError ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {runsError}
            </div>
          ) : null}

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-300">最近 Runs</h3>
            <div className="max-h-[220px] overflow-y-auto rounded-md border border-slate-700">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mailbox</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(runsData?.runs || []).map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>{run.id}</TableCell>
                      <TableCell>{run.status}</TableCell>
                      <TableCell className="text-xs">{run.mailboxEmail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-300">最近 Errors</h3>
            <div className="max-h-[220px] overflow-y-auto rounded-md border border-slate-700">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(runsData?.errors || []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.runId}</TableCell>
                      <TableCell>{item.code || "-"}</TableCell>
                      <TableCell className="text-xs">{item.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>邮件详情</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : detailError ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {detailError}
            </div>
          ) : detail ? (
            <div className="space-y-3 text-sm">
              <p>
                <strong>Mailbox:</strong> {detail.mailboxEmail}
              </p>
              <p>
                <strong>From:</strong> {detail.fromAddress || "-"}
              </p>
              <p>
                <strong>Subject:</strong> {detail.subject || "-"}
              </p>
              <p>
                <strong>Snippet:</strong> {detail.snippet || "-"}
              </p>
              <section className="rounded-md border bg-slate-950/70 p-3">
                <h4 className="mb-2 font-medium">Body Text</h4>
                <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-200">
                  {detail.bodyText || "(empty)"}
                </pre>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  )
}
