import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

import { getArchiveMasterKey } from "@/lib/archive/env"

const AES_ALGO = "aes-256-gcm"
const IV_BYTES = 12
const TAG_BYTES = 16
const PAYLOAD_VERSION = "v1"

function toBase64Url(input: Buffer) {
  return input.toString("base64url")
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url")
}

function deriveAesKey(masterKey: string) {
  return createHash("sha256").update(masterKey, "utf8").digest()
}

export function encryptCredential(plainText: string): string {
  if (!plainText || plainText.trim().length === 0) {
    throw new Error("Credential must not be empty.")
  }

  const iv = randomBytes(IV_BYTES)
  const key = deriveAesKey(getArchiveMasterKey())
  const cipher = createCipheriv(AES_ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [PAYLOAD_VERSION, toBase64Url(iv), toBase64Url(tag), toBase64Url(encrypted)].join(".")
}

export function decryptCredential(payload: string): string {
  const [version, ivRaw, tagRaw, cipherRaw] = payload.split(".")
  if (version !== PAYLOAD_VERSION || !ivRaw || !tagRaw || !cipherRaw) {
    throw new Error("Invalid credential payload format.")
  }

  const iv = fromBase64Url(ivRaw)
  const tag = fromBase64Url(tagRaw)
  const cipherText = fromBase64Url(cipherRaw)
  if (iv.byteLength !== IV_BYTES || tag.byteLength !== TAG_BYTES) {
    throw new Error("Invalid credential payload envelope.")
  }

  const key = deriveAesKey(getArchiveMasterKey())
  const decipher = createDecipheriv(AES_ALGO, key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(cipherText), decipher.final()])
  return plain.toString("utf8")
}

export function redactCredential(input: string) {
  if (!input) {
    return ""
  }

  if (input.length <= 6) {
    return "***"
  }
  return `${input.slice(0, 3)}***${input.slice(-3)}`
}
