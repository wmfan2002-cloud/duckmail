import { desc, eq } from "drizzle-orm"

import { mailboxes } from "@/db/schema"
import { decryptCredential, encryptCredential, redactCredential } from "@/lib/archive/crypto"
import { getArchiveDb } from "@/lib/archive/db"
import { assertArchiveRuntimeReady } from "@/lib/archive/runtime"

type UpsertMailboxInput = {
  email: string
  password: string
  provider?: string
}

type RevealMailboxOptions = {
  revealCredential?: boolean
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function upsertMailboxCredential(input: UpsertMailboxInput) {
  assertArchiveRuntimeReady()

  const email = normalizeEmail(input.email)
  if (!email) {
    throw new Error("email is required")
  }
  if (!input.password || input.password.trim().length === 0) {
    throw new Error("password is required")
  }

  const db = getArchiveDb()
  const passwordEnc = encryptCredential(input.password)
  const now = new Date()
  const provider = input.provider?.trim() || "wmxs.cloud"

  const [row] = await db
    .insert(mailboxes)
    .values({
      email,
      provider,
      passwordEnc,
      updatedAt: now,
      createdAt: now,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: mailboxes.email,
      set: {
        provider,
        passwordEnc,
        updatedAt: now,
        isActive: true,
      },
    })
    .returning({
      id: mailboxes.id,
      email: mailboxes.email,
      provider: mailboxes.provider,
      isActive: mailboxes.isActive,
      passwordEnc: mailboxes.passwordEnc,
      updatedAt: mailboxes.updatedAt,
      createdAt: mailboxes.createdAt,
    })

  return {
    ...row,
    passwordPreview: redactCredential(input.password),
  }
}

export async function setMailboxActive(mailboxId: number, isActive: boolean) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const now = new Date()
  const [row] = await db
    .update(mailboxes)
    .set({
      isActive,
      updatedAt: now,
    })
    .where(eq(mailboxes.id, mailboxId))
    .returning({
      id: mailboxes.id,
      email: mailboxes.email,
      provider: mailboxes.provider,
      isActive: mailboxes.isActive,
      updatedAt: mailboxes.updatedAt,
    })

  return row ?? null
}

export async function deleteMailboxById(mailboxId: number) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const [row] = await db
    .delete(mailboxes)
    .where(eq(mailboxes.id, mailboxId))
    .returning({
      id: mailboxes.id,
      email: mailboxes.email,
    })

  return row ?? null
}

export async function listMailboxes(options: RevealMailboxOptions = {}) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const rows = await db
    .select({
      id: mailboxes.id,
      email: mailboxes.email,
      provider: mailboxes.provider,
      isActive: mailboxes.isActive,
      passwordEnc: mailboxes.passwordEnc,
      updatedAt: mailboxes.updatedAt,
      createdAt: mailboxes.createdAt,
    })
    .from(mailboxes)
    .orderBy(desc(mailboxes.updatedAt))

  return rows.map((row) => ({
    ...row,
    credential: options.revealCredential ? decryptCredential(row.passwordEnc) : undefined,
    passwordEncPreview: redactCredential(row.passwordEnc),
  }))
}

export async function getMailboxById(mailboxId: number, options: RevealMailboxOptions = {}) {
  assertArchiveRuntimeReady()
  const db = getArchiveDb()
  const [row] = await db
    .select({
      id: mailboxes.id,
      email: mailboxes.email,
      provider: mailboxes.provider,
      isActive: mailboxes.isActive,
      passwordEnc: mailboxes.passwordEnc,
      updatedAt: mailboxes.updatedAt,
      createdAt: mailboxes.createdAt,
    })
    .from(mailboxes)
    .where(eq(mailboxes.id, mailboxId))
    .limit(1)

  if (!row) {
    return null
  }

  return {
    ...row,
    credential: options.revealCredential ? decryptCredential(row.passwordEnc) : undefined,
    passwordEncPreview: redactCredential(row.passwordEnc),
  }
}

export async function getMailboxByEmail(email: string, options: RevealMailboxOptions = {}) {
  assertArchiveRuntimeReady()
  const normalized = normalizeEmail(email)
  const db = getArchiveDb()
  const [row] = await db
    .select({
      id: mailboxes.id,
      email: mailboxes.email,
      provider: mailboxes.provider,
      isActive: mailboxes.isActive,
      passwordEnc: mailboxes.passwordEnc,
      updatedAt: mailboxes.updatedAt,
      createdAt: mailboxes.createdAt,
    })
    .from(mailboxes)
    .where(eq(mailboxes.email, normalized))
    .limit(1)

  if (!row) {
    return null
  }

  return {
    ...row,
    credential: options.revealCredential ? decryptCredential(row.passwordEnc) : undefined,
    passwordEncPreview: redactCredential(row.passwordEnc),
  }
}
