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

const DEFAULT_ARCHIVE_PROVIDER_BASE_URL = "https://api.duckmail.sbs"

type TestLoginInput = {
  email: string
  password: string
  provider?: string
}

function normalizeProvider(provider?: string) {
  return (provider || "wmxs.cloud").trim().toLowerCase()
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

  // 当前归档登录统一走可配置的上游 token 端点，不强制限制 provider 枚举。
  const endpoint = `${process.env.ARCHIVE_PROVIDER_BASE_URL || DEFAULT_ARCHIVE_PROVIDER_BASE_URL}/token`
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
