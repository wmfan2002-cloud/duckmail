import { testMailboxLogin } from "@/lib/archive/provider-client"

async function main() {
  const originalFetch = global.fetch
  global.fetch = (async () =>
    new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })) as typeof fetch

  try {
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
    if (unsupported.code !== "INVALID_CREDENTIALS") {
      throw new Error(`expected INVALID_CREDENTIALS, got ${unsupported.code}`)
    }

    console.log(`[archive] test-login self-test ok invalid=${invalid.code} unsupported=${unsupported.code}`)
  } finally {
    global.fetch = originalFetch
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown"
  console.error(`[archive] test-login self-test failed: ${message}`)
  process.exit(1)
})
