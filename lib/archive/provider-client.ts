type LoginCode =
  | "OK"
  | "INVALID_CREDENTIALS"
  | "UNSUPPORTED_PROVIDER"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR"

type TestLoginResult = {
  code: LoginCode
  ok: boolean
}

const DEFAULT_MAIL_TM_BASE_URL = "https://api.mail.tm"

type TestLoginInput = {
  email: string
  password: string
  provider?: string
}

function normalizeProvider(provider?: string) {
  return (provider || "mail.tm").trim().toLowerCase()
}

function isCredentialShapeValid(email: string, password: string) {
  return email.includes("@") && password.trim().length > 0
}

export async function testMailboxLogin(input: TestLoginInput): Promise<TestLoginResult> {
  const provider = normalizeProvider(input.provider)
  if (!isCredentialShapeValid(input.email, input.password)) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
    }
  }

  if (provider !== "mail.tm") {
    return {
      ok: false,
      code: "UNSUPPORTED_PROVIDER",
    }
  }

  const endpoint = `${process.env.ARCHIVE_PROVIDER_BASE_URL || DEFAULT_MAIL_TM_BASE_URL}/token`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        address: input.email,
        password: input.password,
      }),
      signal: controller.signal,
    })

    if (response.ok) {
      return {
        ok: true,
        code: "OK",
      }
    }

    if (response.status === 401 || response.status === 422) {
      return {
        ok: false,
        code: "INVALID_CREDENTIALS",
      }
    }

    return {
      ok: false,
      code: "UPSTREAM_ERROR",
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        code: "UPSTREAM_TIMEOUT",
      }
    }

    return {
      ok: false,
      code: "UPSTREAM_ERROR",
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
