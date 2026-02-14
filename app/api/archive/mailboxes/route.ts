import { NextRequest, NextResponse } from "next/server"

import { getMailboxByEmail, listMailboxes, upsertMailboxCredential } from "@/lib/archive/mailbox-repository"

export const runtime = "nodejs"

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "archive mailbox request failed"
  return NextResponse.json({ code: "INTERNAL_ERROR", error: message }, { status })
}

function canRevealCredential(request: NextRequest) {
  const debugToken = process.env.ARCHIVE_DEBUG_TOKEN
  if (!debugToken) {
    return false
  }
  const tokenFromHeader = request.headers.get("x-archive-debug-token")
  return tokenFromHeader === debugToken
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const email = searchParams.get("email")
  const revealCredential = searchParams.get("revealCredential") === "1"

  if (revealCredential && !canRevealCredential(request)) {
    return NextResponse.json(
      {
        code: "FORBIDDEN_REVEAL",
        error: "revealCredential requires valid x-archive-debug-token",
      },
      { status: 403 },
    )
  }

  try {
    if (email) {
      const mailbox = await getMailboxByEmail(email, { revealCredential })
      if (!mailbox) {
        return NextResponse.json({ code: "MAILBOX_NOT_FOUND", error: "mailbox not found" }, { status: 404 })
      }
      return NextResponse.json({ code: "OK", data: mailbox })
    }

    const rows = await listMailboxes({ revealCredential })
    return NextResponse.json({ code: "OK", data: rows })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  let payload: { email?: string; password?: string; provider?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ code: "INVALID_JSON", error: "invalid JSON payload" }, { status: 400 })
  }

  if (!payload.email || !payload.password) {
    return NextResponse.json(
      { code: "INVALID_INPUT", error: "email and password are required" },
      { status: 400 },
    )
  }

  try {
    const row = await upsertMailboxCredential({
      email: payload.email,
      password: payload.password,
      provider: payload.provider,
    })

    return NextResponse.json({
      code: "OK",
      data: {
        id: row.id,
        email: row.email,
        provider: row.provider,
        isActive: row.isActive,
        passwordEnc: row.passwordEnc,
        passwordPreview: row.passwordPreview,
        isEncrypted: row.passwordEnc !== payload.password,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
