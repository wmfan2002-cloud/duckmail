import { NextRequest, NextResponse } from "next/server"

import { importMailboxes } from "@/lib/archive/mailbox-import"

export const runtime = "nodejs"

type ImportPayload = {
  content?: string
  defaultProvider?: string
  format?: "csv" | "text"
}

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "mailbox import failed"
  return NextResponse.json({ code: "IMPORT_FAILED", error: message }, { status })
}

export async function POST(request: NextRequest) {
  let payload: ImportPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ code: "INVALID_JSON", error: "invalid JSON payload" }, { status: 400 })
  }

  const format = payload.format || "csv"
  if (format !== "csv" && format !== "text") {
    return NextResponse.json(
      { code: "INVALID_FORMAT", error: "format must be csv or text" },
      { status: 400 },
    )
  }
  if (!payload.content || payload.content.trim().length === 0) {
    return NextResponse.json({ code: "INVALID_INPUT", error: "content is required" }, { status: 400 })
  }

  try {
    const summary = await importMailboxes({
      content: payload.content,
      format,
      defaultProvider: payload.defaultProvider,
    })
    return NextResponse.json({
      code: "OK",
      data: summary,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
