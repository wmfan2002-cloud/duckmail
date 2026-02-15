"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowLeft, CheckCircle2, DownloadCloud, Loader2, Power, PowerOff, RefreshCw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type MailboxItem = {
  email: string
  id: number
  isActive: boolean
  passwordEncPreview?: string
  provider: string
  updatedAt?: string
}

type MailboxResponse = {
  code: string
  data?: MailboxItem[]
  error?: string
}

type ImportResult = {
  email?: string
  id?: number
  line: number
  reason?: string
  status: "success" | "failed"
}

type ImportSummary = {
  failed: number
  format: "csv" | "text"
  results: ImportResult[]
  success: number
  total: number
}

type ImportResponse = {
  code: string
  data?: ImportSummary
  error?: string
}

const MAILBOX_PAGE_SIZE = 30
const IMPORT_PAGE_SIZE = 50

const ERROR_LABELS: Record<string, string> = {
  INVALID_JSON: "请求 JSON 格式不正确",
  INVALID_INPUT: "输入参数不完整或格式错误",
  INVALID_FORMAT: "导入格式只支持 csv 或 text",
  MAILBOX_NOT_FOUND: "邮箱记录不存在，可能已被删除",
  IMPORT_FAILED: "导入过程中出现异常",
  INTERNAL_ERROR: "服务内部错误，请稍后重试",
}

function formatError(code: string | undefined, fallback?: string) {
  if (!code) {
    return fallback || "未知错误"
  }
  return ERROR_LABELS[code] || fallback || code
}

export default function ArchiveMailboxPage() {
  const [mailboxes, setMailboxes] = useState<MailboxItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [switchingIds, setSwitchingIds] = useState<number[]>([])
  const [deletingIds, setDeletingIds] = useState<number[]>([])

  const [importOpen, setImportOpen] = useState(false)
  const [importFormat, setImportFormat] = useState<"csv" | "text">("csv")
  const [importContent, setImportContent] = useState("")
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState("")
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [importFilter, setImportFilter] = useState<"all" | "success" | "failed">("all")
  const [importPage, setImportPage] = useState(1)

  useEffect(() => {
    void loadMailboxes()
  }, [])

  async function loadMailboxes() {
    setListLoading(true)
    setListError("")
    try {
      const response = await fetch("/api/archive/mailboxes", { method: "GET" })
      const payload = (await response.json()) as MailboxResponse
      if (!response.ok || payload.code !== "OK") {
        throw new Error(formatError(payload.code, payload.error))
      }
      setMailboxes(payload.data || [])
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载邮箱列表失败"
      setListError(message)
    } finally {
      setListLoading(false)
    }
  }

  async function toggleMailbox(mailbox: MailboxItem) {
    setSwitchingIds((prev) => [...prev, mailbox.id])
    try {
      const response = await fetch(`/api/archive/mailboxes/${mailbox.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ isActive: !mailbox.isActive }),
      })
      const payload = (await response.json()) as { code?: string; error?: string }
      if (!response.ok || payload.code !== "OK") {
        throw new Error(formatError(payload.code, payload.error))
      }
      setMailboxes((prev) =>
        prev.map((item) =>
          item.id === mailbox.id
            ? {
                ...item,
                isActive: !item.isActive,
              }
            : item,
        ),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "状态切换失败"
      setListError(message)
    } finally {
      setSwitchingIds((prev) => prev.filter((id) => id !== mailbox.id))
    }
  }

  async function handleImport() {
    if (!importContent.trim()) {
      setImportError("请先粘贴导入内容")
      return
    }

    setImportError("")
    setImporting(true)
    setImportPage(1)
    try {
      const response = await fetch("/api/archive/mailboxes/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          format: importFormat,
          content: importContent,
        }),
      })
      const payload = (await response.json()) as ImportResponse
      if (!response.ok || payload.code !== "OK" || !payload.data) {
        throw new Error(formatError(payload.code, payload.error))
      }
      setImportSummary(payload.data)
      await loadMailboxes()
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败"
      setImportError(message)
    } finally {
      setImporting(false)
    }
  }

  async function removeMailbox(mailbox: MailboxItem) {
    const confirmed = window.confirm(
      `确认删除邮箱 ${mailbox.email} 吗？\n\n删除后将同时删除该邮箱关联的归档消息与同步记录，此操作不可恢复。`,
    )
    if (!confirmed) {
      return
    }

    setDeletingIds((prev) => [...prev, mailbox.id])
    try {
      const response = await fetch(`/api/archive/mailboxes/${mailbox.id}`, {
        method: "DELETE",
      })
      const payload = (await response.json()) as { code?: string; error?: string }
      if (!response.ok || payload.code !== "OK") {
        throw new Error(formatError(payload.code, payload.error))
      }

      setMailboxes((prev) => prev.filter((item) => item.id !== mailbox.id))
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除邮箱失败"
      setListError(message)
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== mailbox.id))
    }
  }

  const filteredMailboxes = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) {
      return mailboxes
    }
    return mailboxes.filter(
      (item) =>
        item.email.toLowerCase().includes(keyword) ||
        item.provider.toLowerCase().includes(keyword) ||
        String(item.id).includes(keyword),
    )
  }, [mailboxes, query])

  const totalMailboxPages = Math.max(1, Math.ceil(filteredMailboxes.length / MAILBOX_PAGE_SIZE))
  const pagedMailboxes = useMemo(() => {
    const safePage = Math.min(page, totalMailboxPages)
    const start = (safePage - 1) * MAILBOX_PAGE_SIZE
    return filteredMailboxes.slice(start, start + MAILBOX_PAGE_SIZE)
  }, [filteredMailboxes, page, totalMailboxPages])

  const filteredImportResults = useMemo(() => {
    if (!importSummary) {
      return []
    }
    if (importFilter === "all") {
      return importSummary.results
    }
    return importSummary.results.filter((item) => item.status === importFilter)
  }, [importSummary, importFilter])

  const totalImportPages = Math.max(1, Math.ceil(filteredImportResults.length / IMPORT_PAGE_SIZE))
  const pagedImportResults = useMemo(() => {
    const safePage = Math.min(importPage, totalImportPages)
    const start = (safePage - 1) * IMPORT_PAGE_SIZE
    return filteredImportResults.slice(start, start + IMPORT_PAGE_SIZE)
  }, [filteredImportResults, importPage, totalImportPages])

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-800 dark:bg-gray-900 dark:text-gray-100 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">DuckMail Archive Console</p>
              <h1 className="mt-2 text-2xl font-semibold md:text-3xl">邮箱管理与导入面板</h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                支持批量导入结果回显、错误行筛选和邮箱启停。默认分页渲染，500 行导入结果不会一次性阻塞页面。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/">
                  <ArrowLeft className="h-4 w-4" />
                  返回主页面
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/archive/search">检索与日志</Link>
              </Button>
              <Button onClick={() => void loadMailboxes()} disabled={listLoading} variant="outline">
                {listLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                刷新列表
              </Button>
              <Button onClick={() => setImportOpen(true)}>
                <DownloadCloud className="h-4 w-4" />
                批量导入
              </Button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">邮箱总数</p>
            <p className="mt-3 text-3xl font-semibold">{mailboxes.length}</p>
          </article>
          <article className="rounded-xl border border-emerald-300 bg-white p-4 dark:border-emerald-700/50 dark:bg-gray-900">
            <p className="text-xs uppercase tracking-widest text-emerald-600 dark:text-emerald-300">启用中</p>
            <p className="mt-3 text-3xl font-semibold text-emerald-600 dark:text-emerald-200">
              {mailboxes.filter((item) => item.isActive).length}
            </p>
          </article>
          <article className="rounded-xl border border-orange-300 bg-white p-4 dark:border-orange-700/50 dark:bg-gray-900">
            <p className="text-xs uppercase tracking-widest text-orange-600 dark:text-orange-300">已停用</p>
            <p className="mt-3 text-3xl font-semibold text-orange-600 dark:text-orange-200">
              {mailboxes.filter((item) => !item.isActive).length}
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Input
              placeholder="按邮箱/provider/id 过滤"
              className="max-w-md bg-white dark:bg-gray-800"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
            />
            <p className="text-sm text-gray-600 dark:text-gray-300">
              第 {Math.min(page, totalMailboxPages)} / {totalMailboxPages} 页
            </p>
          </div>

          {listError ? (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200">
              <AlertCircle className="h-4 w-4" />
              {listError}
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>密文预览</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedMailboxes.map((item) => {
                const switching = switchingIds.includes(item.id)
                const deleting = deletingIds.includes(item.id)
                return (
                  <TableRow key={item.id}>
                    <TableCell>{item.id}</TableCell>
                    <TableCell className="font-medium">{item.email}</TableCell>
                    <TableCell>{item.provider}</TableCell>
                    <TableCell className="font-mono text-xs text-gray-600 dark:text-gray-300">
                      {item.passwordEncPreview || "-"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          item.isActive
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200"
                        }`}
                      >
                        {item.isActive ? "active" : "disabled"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={item.isActive ? "destructive" : "secondary"}
                        onClick={() => void toggleMailbox(item)}
                        disabled={switching || deleting}
                      >
                        {switching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {item.isActive ? (
                          <>
                            <PowerOff className="h-4 w-4" />
                            停用
                          </>
                        ) : (
                          <>
                            <Power className="h-4 w-4" />
                            启用
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-2 text-red-600 hover:text-red-600 dark:text-red-300 dark:hover:text-red-200"
                        onClick={() => void removeMailbox(item)}
                        disabled={switching || deleting}
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        删除
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              disabled={page >= totalMailboxPages}
              onClick={() => setPage((prev) => Math.min(totalMailboxPages, prev + 1))}
            >
              下一页
            </Button>
          </div>
        </section>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border border-gray-200 bg-white shadow-2xl sm:max-w-4xl dark:border-gray-800 dark:bg-gray-900">
          <DialogHeader className="border-b border-gray-200 pb-3 dark:border-gray-700">
            <DialogTitle>批量导入邮箱</DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-300">
              CSV 示例：`email,password,provider`。Text 示例：`email----password` 或 `email password`。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={importFormat === "csv" ? "default" : "outline"}
                onClick={() => setImportFormat("csv")}
              >
                CSV
              </Button>
              <Button
                variant={importFormat === "text" ? "default" : "outline"}
                onClick={() => setImportFormat("text")}
              >
                Text
              </Button>
            </div>

            <Textarea
              rows={10}
              value={importContent}
              onChange={(event) => setImportContent(event.target.value)}
              placeholder="粘贴待导入内容..."
              className="min-h-[260px] border-gray-300 bg-white font-mono text-xs text-gray-900 shadow-sm placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
            />

            {importError ? (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                <AlertCircle className="h-4 w-4" />
                {importError}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)}>
                关闭
              </Button>
              <Button onClick={() => void handleImport()} disabled={importing}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
                执行导入
              </Button>
            </div>

            {importSummary ? (
              <section className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    总计 {importSummary.total} 行，成功 {importSummary.success}，失败 {importSummary.failed}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={importFilter === "all" ? "default" : "outline"}
                      onClick={() => {
                        setImportFilter("all")
                        setImportPage(1)
                      }}
                    >
                      全部
                    </Button>
                    <Button
                      size="sm"
                      variant={importFilter === "success" ? "default" : "outline"}
                      onClick={() => {
                        setImportFilter("success")
                        setImportPage(1)
                      }}
                    >
                      成功
                    </Button>
                    <Button
                      size="sm"
                      variant={importFilter === "failed" ? "default" : "outline"}
                      onClick={() => {
                        setImportFilter("failed")
                        setImportPage(1)
                      }}
                    >
                      失败
                    </Button>
                  </div>
                </div>

                <div className="max-h-[280px] overflow-y-auto rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedImportResults.map((item) => (
                        <TableRow key={`${item.line}-${item.email || "empty"}`}>
                          <TableCell>{item.line}</TableCell>
                          <TableCell>{item.email || "-"}</TableCell>
                          <TableCell>
                            {item.status === "success" ? (
                              <span className="inline-flex items-center gap-1 text-emerald-300">
                                <CheckCircle2 className="h-4 w-4" />
                                success
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-300">
                                <AlertCircle className="h-4 w-4" />
                                failed
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-gray-600 dark:text-gray-300">{item.reason || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={importPage <= 1}
                    onClick={() => setImportPage((prev) => Math.max(1, prev - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={importPage >= totalImportPages}
                    onClick={() => setImportPage((prev) => Math.min(totalImportPages, prev + 1))}
                  >
                    下一页
                  </Button>
                </div>
              </section>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
