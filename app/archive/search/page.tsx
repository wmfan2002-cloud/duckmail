"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { AlertCircle, ArrowLeft, Clock3, Eye, Loader2, Play, RefreshCw, Save, Search, Trash2 } from "lucide-react"

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

type SchedulerConfig = {
  enabled: boolean
  intervalMinutes: 30 | 60
  lastTriggeredAt: string | null
  maxQueue: number
  processLimit: number
  updatedAt: string
}

type SchedulerConfigResponse = {
  code: string
  data?: SchedulerConfig
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
  const [schedulerLoading, setSchedulerLoading] = useState(false)
  const [schedulerSaving, setSchedulerSaving] = useState(false)
  const [schedulerRunning, setSchedulerRunning] = useState(false)
  const [schedulerError, setSchedulerError] = useState("")
  const [schedulerConfig, setSchedulerConfig] = useState<SchedulerConfig>({
    enabled: true,
    intervalMinutes: 30,
    lastTriggeredAt: null,
    maxQueue: 30,
    processLimit: 20,
    updatedAt: "",
  })

  useEffect(() => {
    void loadMessages(1)
    void loadSyncRuns()
    void loadSchedulerConfig()
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

  async function loadSchedulerConfig() {
    setSchedulerLoading(true)
    setSchedulerError("")
    try {
      const response = await fetch("/api/archive/sync/scheduler-config")
      const payload = (await response.json()) as SchedulerConfigResponse
      if (!response.ok || payload.code !== "OK" || !payload.data) {
        throw new Error(payload.error || payload.code || "定时配置获取失败")
      }
      setSchedulerConfig(payload.data)
    } catch (error) {
      const message = error instanceof Error ? error.message : "定时配置获取失败"
      setSchedulerError(message)
    } finally {
      setSchedulerLoading(false)
    }
  }

  async function saveSchedulerConfig() {
    setSchedulerSaving(true)
    setSchedulerError("")
    try {
      const response = await fetch("/api/archive/sync/scheduler-config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          enabled: schedulerConfig.enabled,
          intervalMinutes: schedulerConfig.intervalMinutes,
          maxQueue: schedulerConfig.maxQueue,
          processLimit: schedulerConfig.processLimit,
        }),
      })
      const payload = (await response.json()) as SchedulerConfigResponse
      if (!response.ok || payload.code !== "OK" || !payload.data) {
        throw new Error(payload.error || payload.code || "定时配置保存失败")
      }
      setSchedulerConfig(payload.data)
    } catch (error) {
      const message = error instanceof Error ? error.message : "定时配置保存失败"
      setSchedulerError(message)
    } finally {
      setSchedulerSaving(false)
    }
  }

  async function runScheduledSyncNow() {
    setSchedulerRunning(true)
    setSchedulerError("")
    try {
      const response = await fetch("/api/archive/sync/scheduled", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ force: true }),
      })
      const payload = (await response.json()) as { code?: string; error?: string }
      if (!response.ok || payload.code !== "OK") {
        throw new Error(payload.error || payload.code || "立即同步失败")
      }
      await Promise.all([loadSyncRuns(), loadMessages(1), loadSchedulerConfig()])
    } catch (error) {
      const message = error instanceof Error ? error.message : "立即同步失败"
      setSchedulerError(message)
    } finally {
      setSchedulerRunning(false)
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
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-800 dark:bg-gray-900 dark:text-gray-100 md:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Archive Search</p>
              <h1 className="mt-2 text-2xl font-semibold">归档检索与删除面板</h1>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/">
                  <ArrowLeft className="h-4 w-4" />
                  返回主页面
                </Link>
              </Button>
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
                className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800"
                value={deleteMode}
                onChange={(event) => setDeleteMode(event.target.value as "local" | "remote" | "both")}
              >
                <option value="both">delete mode: both</option>
                <option value="local">delete mode: local</option>
                <option value="remote">delete mode: remote</option>
              </select>
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
            <div className="md:col-span-3 flex justify-end">
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
          </div>

          {listError ? (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              <AlertCircle className="h-4 w-4" />
              {listError}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
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
            <span className="inline-flex items-center text-sm text-gray-600 dark:text-gray-300">
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

        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">同步记录与错误日志</h2>
            <Button variant="outline" size="sm" onClick={() => void loadSyncRuns()} disabled={runsLoading}>
              {runsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </Button>
          </div>

          <section className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/70">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">自动同步设置</h3>
              <Clock3 className="h-4 w-4 text-gray-500 dark:text-gray-300" />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              建议平台按固定频率触发 `/api/archive/sync/scheduled`，这里控制实际执行间隔（30/60 分钟）与队列参数。
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs text-gray-600 dark:text-gray-300">同步开关</label>
              <select
                className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                value={schedulerConfig.enabled ? "enabled" : "disabled"}
                onChange={(event) =>
                  setSchedulerConfig((prev) => ({
                    ...prev,
                    enabled: event.target.value === "enabled",
                  }))
                }
                disabled={schedulerLoading || schedulerSaving || schedulerRunning}
              >
                <option value="enabled">启用自动同步</option>
                <option value="disabled">暂停自动同步</option>
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-600 dark:text-gray-300">执行间隔</label>
                <select
                  className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                  value={schedulerConfig.intervalMinutes}
                  onChange={(event) =>
                    setSchedulerConfig((prev) => ({
                      ...prev,
                      intervalMinutes: Number(event.target.value) === 60 ? 60 : 30,
                    }))
                  }
                  disabled={schedulerLoading || schedulerSaving || schedulerRunning}
                >
                  <option value={30}>30 分钟</option>
                  <option value={60}>60 分钟</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-600 dark:text-gray-300">maxQueue</label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={String(schedulerConfig.maxQueue)}
                  onChange={(event) =>
                    setSchedulerConfig((prev) => ({
                      ...prev,
                      maxQueue: Math.max(1, Math.min(200, Number(event.target.value) || 1)),
                    }))
                  }
                  disabled={schedulerLoading || schedulerSaving || schedulerRunning}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-600 dark:text-gray-300">processLimit</label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={String(schedulerConfig.processLimit)}
                  onChange={(event) =>
                    setSchedulerConfig((prev) => ({
                      ...prev,
                      processLimit: Math.max(1, Math.min(200, Number(event.target.value) || 1)),
                    }))
                  }
                  disabled={schedulerLoading || schedulerSaving || schedulerRunning}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              上次执行：{schedulerConfig.lastTriggeredAt ? new Date(schedulerConfig.lastTriggeredAt).toLocaleString() : "尚未执行"}
            </p>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadSchedulerConfig()}
                disabled={schedulerLoading || schedulerSaving || schedulerRunning}
              >
                {schedulerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                读取配置
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runScheduledSyncNow()}
                disabled={schedulerLoading || schedulerSaving || schedulerRunning}
              >
                {schedulerRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                立即执行
              </Button>
              <Button size="sm" onClick={() => void saveSchedulerConfig()} disabled={schedulerLoading || schedulerSaving || schedulerRunning}>
                {schedulerSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存设置
              </Button>
            </div>

            {schedulerError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                {schedulerError}
              </div>
            ) : null}
          </section>

          {runsError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              {runsError}
            </div>
          ) : null}

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">最近 Runs</h3>
            <div className="max-h-[220px] overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
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
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">最近 Errors</h3>
            <div className="max-h-[220px] overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
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
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : detailError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
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
              <section className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/70">
                <h4 className="mb-2 font-medium">Body Text</h4>
                <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-700 dark:text-gray-200">
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
