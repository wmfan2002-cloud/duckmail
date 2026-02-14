import { NextRequest, NextResponse } from "next/server"

import { getMessageDetail } from "@/lib/archive/message-repository"
import { DeleteMode, deleteMessageByMode } from "@/lib/archive/message-service"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ id: string }>
}

function parseMode(raw: string | null): DeleteMode | null {
  if (!raw) {
    return "both"
  }
  if (raw === "local" || raw === "remote" || raw === "both") {
    return raw
  }
  return null
}

export async function GET(_: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const messageId = Number(id)
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return NextResponse.json({ code: "INVALID_ID", error: "invalid message id" }, { status: 400 })
  }

  const detail = await getMessageDetail(messageId)
  if (!detail) {
    return NextResponse.json({ code: "MESSAGE_NOT_FOUND", error: "message not found" }, { status: 404 })
  }
  return NextResponse.json({
    code: "OK",
    data: detail,
  })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const messageId = Number(id)
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return NextResponse.json({ code: "INVALID_ID", error: "invalid message id" }, { status: 400 })
  }

  const mode = parseMode(request.nextUrl.searchParams.get("mode"))
  if (!mode) {
    return NextResponse.json(
      { code: "INVALID_MODE", error: "mode must be local|remote|both" },
      { status: 400 },
    )
  }

  try {
    const result = await deleteMessageByMode(messageId, mode)
    return NextResponse.json({
      code: result.status === "partial" ? "DELETE_PARTIAL" : "DELETE_OK",
      data: result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "delete failed"
    if (message.includes("message not found")) {
      return NextResponse.json({ code: "MESSAGE_NOT_FOUND", error: message }, { status: 404 })
    }
    return NextResponse.json({ code: "DELETE_FAILED", error: message }, { status: 500 })
  }
}
