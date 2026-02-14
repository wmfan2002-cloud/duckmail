import { NextRequest, NextResponse } from "next/server"

import { getMailboxById } from "@/lib/archive/mailbox-repository"
import { testMailboxLogin } from "@/lib/archive/provider-client"

export const runtime = "nodejs"

type LoginPayload = {
  email?: string
  mailboxId?: number
  password?: string
  provider?: string
}

export async function POST(request: NextRequest) {
  let payload: LoginPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ code: "INVALID_JSON", error: "invalid JSON payload" }, { status: 400 })
  }

  let email = payload.email?.trim()
  let password = payload.password
  let provider = payload.provider

  if (payload.mailboxId !== undefined) {
    if (!Number.isInteger(payload.mailboxId) || payload.mailboxId <= 0) {
      return NextResponse.json(
        { code: "INVALID_INPUT", error: "mailboxId must be a positive integer" },
        { status: 400 },
      )
    }
    const mailbox = await getMailboxById(payload.mailboxId, { revealCredential: true })
    if (!mailbox || !mailbox.credential) {
      return NextResponse.json({ code: "MAILBOX_NOT_FOUND", error: "mailbox not found" }, { status: 404 })
    }
    email = mailbox.email
    password = mailbox.credential
    provider = mailbox.provider
  }

  if (!email || !password) {
    return NextResponse.json(
      { code: "INVALID_INPUT", error: "email/password or mailboxId is required" },
      { status: 400 },
    )
  }

  const result = await testMailboxLogin({
    email,
    password,
    provider,
  })

  return NextResponse.json({
    code: result.code,
    ok: result.ok,
    data: {
      email,
      provider: provider || "mail.tm",
    },
  })
}
