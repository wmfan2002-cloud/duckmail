import { NextRequest, NextResponse } from "next/server"

import { searchMessages } from "@/lib/archive/message-repository"

export const runtime = "nodejs"

function parseDate(raw: string | null) {
  if (!raw) {
    return undefined
  }
  const value = new Date(raw)
  if (Number.isNaN(value.getTime())) {
    return undefined
  }
  return value
}

function parseIntWithDefault(raw: string | null, fallback: number) {
  if (!raw) {
    return fallback
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  try {
    const result = await searchMessages({
      mailbox: searchParams.get("mailbox") || undefined,
      domain: searchParams.get("domain") || undefined,
      from: searchParams.get("from") || undefined,
      subject: searchParams.get("subject") || undefined,
      q: searchParams.get("q") || undefined,
      start: parseDate(searchParams.get("start")),
      end: parseDate(searchParams.get("end")),
      page: parseIntWithDefault(searchParams.get("page"), 1),
      pageSize: parseIntWithDefault(searchParams.get("pageSize"), 50),
      includeDeleted: searchParams.get("includeDeleted") === "1",
    })

    return NextResponse.json({
      code: "OK",
      data: result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "search failed"
    return NextResponse.json({ code: "SEARCH_FAILED", error: message }, { status: 500 })
  }
}
