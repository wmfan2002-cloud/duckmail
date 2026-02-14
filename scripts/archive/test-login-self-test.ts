import { testMailboxLogin } from "@/lib/archive/provider-client"

async function main() {
  const invalid = await testMailboxLogin({
    email: "not-an-email",
    password: "",
    provider: "mail.tm",
  })
  if (invalid.code !== "INVALID_CREDENTIALS") {
    throw new Error(`expected INVALID_CREDENTIALS, got ${invalid.code}`)
  }

  const unsupported = await testMailboxLogin({
    email: "foo@example.com",
    password: "x",
    provider: "custom",
  })
  if (unsupported.code !== "UNSUPPORTED_PROVIDER") {
    throw new Error(`expected UNSUPPORTED_PROVIDER, got ${unsupported.code}`)
  }

  console.log(`[archive] test-login self-test ok invalid=${invalid.code} unsupported=${unsupported.code}`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown"
  console.error(`[archive] test-login self-test failed: ${message}`)
  process.exit(1)
})
