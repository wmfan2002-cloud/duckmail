"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardBody } from "@heroui/card"
import { Spinner } from "@heroui/spinner"
import { Button } from "@heroui/button"
import { ArrowLeft, Clock3, Mail, RefreshCw } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"

type ArchiveMessageItem = {
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

type ArchiveMessageDetail = ArchiveMessageItem & {
  bodyHtml: string | null
  deletedAt: string | null
  provider: string
}

type ArchiveSearchResponse = {
  code: string
  data?: {
    items: ArchiveMessageItem[]
    page: number
    pageSize: number
    total: number
  }
  error?: string
}

type ArchiveDetailResponse = {
  code: string
  data?: ArchiveMessageDetail
  error?: string
}

interface ArchiveHistoryListProps {
  accountEmail?: string
  currentLocale: string
  refreshKey?: number
}

const PAGE_SIZE = 20

export default function ArchiveHistoryList({
  accountEmail,
  currentLocale,
  refreshKey,
}: ArchiveHistoryListProps) {
  const [messages, setMessages] = useState<ArchiveMessageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detail, setDetail] = useState<ArchiveMessageDetail | null>(null)

  const locale = currentLocale === "en" ? enUS : zhCN
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  const loadMessages = useCallback(
    async (targetPage: number) => {
      if (!accountEmail) {
        setMessages([])
        setTotal(0)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          mailbox: accountEmail,
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        })
        const response = await fetch(`/api/archive/messages?${params.toString()}`)
        const payload = (await response.json()) as ArchiveSearchResponse
        if (!response.ok || payload.code !== "OK" || !payload.data) {
          throw new Error(payload.error || payload.code || "archive messages load failed")
        }

        setMessages(payload.data.items || [])
        setPage(payload.data.page)
        setTotal(payload.data.total)
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : currentLocale === "en"
              ? "Failed to load archive messages."
              : "历史邮件加载失败。"
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    [accountEmail, currentLocale],
  )

  async function openDetail(messageId: number) {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const response = await fetch(`/api/archive/messages/${messageId}`)
      const payload = (await response.json()) as ArchiveDetailResponse
      if (!response.ok || payload.code !== "OK" || !payload.data) {
        throw new Error(payload.error || payload.code || "archive message detail failed")
      }
      setDetail(payload.data)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : currentLocale === "en"
            ? "Failed to load archive message detail."
            : "历史邮件详情加载失败。"
      setDetailError(message)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    setDetail(null)
    setDetailError(null)
    setPage(1)
    void loadMessages(1)
  }, [accountEmail])

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      setDetail(null)
      void loadMessages(1)
    }
  }, [refreshKey, loadMessages])

  if (!accountEmail) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            {currentLocale === "en" ? "Archive History" : "历史邮件"}
          </h2>
        </div>
        <div className="flex flex-col justify-center items-center h-64 text-center">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {currentLocale === "en" ? "No account selected" : "未选择账号"}
          </h3>
        </div>
      </div>
    )
  }

  if (detail || detailLoading || detailError) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            {currentLocale === "en" ? "Archive Detail" : "历史邮件详情"}
          </h2>
          <Button
            variant="flat"
            onPress={() => {
              setDetail(null)
              setDetailError(null)
            }}
            startContent={<ArrowLeft size={16} />}
          >
            {currentLocale === "en" ? "Back" : "返回列表"}
          </Button>
        </div>

        {detailLoading ? (
          <div className="flex justify-center items-center h-64">
            <Spinner size="lg" color="primary" />
          </div>
        ) : detailError ? (
          <Card className="border border-red-200 dark:border-red-700">
            <CardBody className="text-red-600 dark:text-red-300">{detailError}</CardBody>
          </Card>
        ) : detail ? (
          <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
            <CardBody className="space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                <strong>{currentLocale === "en" ? "Mailbox" : "邮箱"}:</strong> {detail.mailboxEmail}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-200">
                <strong>{currentLocale === "en" ? "From" : "发件人"}:</strong> {detail.fromAddress || "-"}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-200">
                <strong>{currentLocale === "en" ? "Subject" : "主题"}:</strong> {detail.subject || "-"}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-200">
                <strong>{currentLocale === "en" ? "Received" : "接收时间"}:</strong>{" "}
                {detail.receivedAt ? new Date(detail.receivedAt).toLocaleString() : "-"}
              </p>
              <section className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3">
                <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                  {currentLocale === "en" ? "Body Text" : "正文"}
                </h3>
                <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                  {detail.bodyText || "(empty)"}
                </pre>
              </section>
            </CardBody>
          </Card>
        ) : null}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            {currentLocale === "en" ? "Archive History" : "历史邮件"}
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{accountEmail}</p>
        </div>
        <Button
          variant="flat"
          onPress={() => void loadMessages(1)}
          startContent={<RefreshCw size={16} />}
          isDisabled={loading}
        >
          {currentLocale === "en" ? "Refresh" : "刷新"}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Spinner size="lg" color="primary" />
        </div>
      ) : error ? (
        <Card className="border border-red-200 dark:border-red-700">
          <CardBody className="text-red-600 dark:text-red-300">{error}</CardBody>
        </Card>
      ) : messages.length === 0 ? (
        <div className="flex flex-col justify-center items-center h-64 text-center">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {currentLocale === "en" ? "No archived mails" : "暂无历史邮件"}
          </h3>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {messages.map((message) => (
              <Card
                key={message.id}
                isPressable
                onPress={() => void openDetail(message.id)}
                className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600"
              >
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {message.subject || (currentLocale === "en" ? "(No Subject)" : "（无主题）")}
                      </h3>
                      <p className="mt-1 truncate text-xs text-gray-600 dark:text-gray-300">
                        {message.fromAddress || "-"}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                        {message.snippet || message.bodyText || "-"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <Clock3 size={14} />
                      {message.receivedAt
                        ? formatDistanceToNow(new Date(message.receivedAt), { addSuffix: true, locale })
                        : "-"}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="light"
              isDisabled={page <= 1 || loading}
              onPress={() => {
                const next = Math.max(1, page - 1)
                void loadMessages(next)
              }}
            >
              {currentLocale === "en" ? "Prev" : "上一页"}
            </Button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {page}/{totalPages}
            </span>
            <Button
              variant="light"
              isDisabled={page >= totalPages || loading}
              onPress={() => {
                const next = Math.min(totalPages, page + 1)
                void loadMessages(next)
              }}
            >
              {currentLocale === "en" ? "Next" : "下一页"}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
