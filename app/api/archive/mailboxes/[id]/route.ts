import { NextRequest, NextResponse } from "next/server"

import { deleteMailboxById, setMailboxActive } from "@/lib/archive/mailbox-repository"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const mailboxId = Number(id)
  if (!Number.isInteger(mailboxId) || mailboxId <= 0) {
    return NextResponse.json({ code: "INVALID_ID", error: "invalid mailbox id" }, { status: 400 })
  }

  let payload: { isActive?: boolean }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ code: "INVALID_JSON", error: "invalid JSON payload" }, { status: 400 })
  }
  if (typeof payload.isActive !== "boolean") {
    return NextResponse.json({ code: "INVALID_INPUT", error: "isActive must be boolean" }, { status: 400 })
  }

  const updated = await setMailboxActive(mailboxId, payload.isActive)
  if (!updated) {
    return NextResponse.json({ code: "MAILBOX_NOT_FOUND", error: "mailbox not found" }, { status: 404 })
  }

  return NextResponse.json({ code: "OK", data: updated })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const mailboxId = Number(id)
  if (!Number.isInteger(mailboxId) || mailboxId <= 0) {
    return NextResponse.json({ code: "INVALID_ID", error: "invalid mailbox id" }, { status: 400 })
  }

  const deleted = await deleteMailboxById(mailboxId)
  if (!deleted) {
    return NextResponse.json({ code: "MAILBOX_NOT_FOUND", error: "mailbox not found" }, { status: 404 })
  }

  return NextResponse.json({
    code: "OK",
    data: deleted,
  })
}
