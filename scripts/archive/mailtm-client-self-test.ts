import {
  mailTmCreateToken,
  mailTmDeleteMessage,
  mailTmGetMessageDetail,
  mailTmListMessages,
} from "@/lib/archive/mailtm-client"

async function main() {
  const originalFetch = global.fetch
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({ token: "token-demo" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.includes("/messages?page=1")) {
      return new Response(JSON.stringify({ "hydra:member": [{ id: "m1", subject: "hello" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.includes("/messages/m1") && init?.method === "DELETE") {
      return new Response(null, { status: 204 })
    }
    if (url.includes("/messages/m1")) {
      return new Response(
        JSON.stringify({
          id: "m1",
          subject: "hello",
          intro: "intro",
          text: "body",
          html: ["<p>body</p>"],
          from: { address: "from@example.com" },
          to: [{ address: "to@example.com" }],
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch

  try {
    const token = await mailTmCreateToken({
      email: "foo@example.com",
      password: "pwd",
    })
    if (token !== "token-demo") {
      throw new Error("token parse failed")
    }

    const list = await mailTmListMessages(token, 1)
    if (list.items.length !== 1 || list.items[0].id !== "m1" || list.hasNext !== true) {
      throw new Error("message list parse failed")
    }

    const detail = await mailTmGetMessageDetail(token, "m1")
    if (detail.id !== "m1" || detail.text !== "body") {
      throw new Error("message detail parse failed")
    }

    const deleted = await mailTmDeleteMessage(token, "m1")
    if (!deleted.deleted || deleted.remoteStatus !== 204) {
      throw new Error("message delete parse failed")
    }

    console.log(
      `[archive] mailtm client self-test ok token=${token} list=${list.items.length} detail=${detail.id} deleted=${deleted.deleted}`,
    )
  } finally {
    global.fetch = originalFetch
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown"
  console.error(`[archive] mailtm client self-test failed: ${message}`)
  process.exit(1)
})
