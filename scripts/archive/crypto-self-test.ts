import { decryptCredential, encryptCredential } from "@/lib/archive/crypto"

function main() {
  const plain = "example-mailbox-password"
  const encrypted = encryptCredential(plain)
  const decrypted = decryptCredential(encrypted)

  if (encrypted === plain) {
    throw new Error("encrypted credential must not equal plaintext")
  }
  if (decrypted !== plain) {
    throw new Error("decrypted credential mismatch")
  }

  console.log(
    `[archive] crypto self-test ok payload_prefix=${encrypted.slice(0, 10)} decrypted_len=${decrypted.length}`,
  )
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown"
  console.error(`[archive] crypto self-test failed: ${message}`)
  process.exit(1)
}
