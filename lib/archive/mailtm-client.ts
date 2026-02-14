type RequestOptions = {
  beforeRequest?: () => Promise<void>
}

type MailTmAddress = {
  address?: string
}

type MailTmMessageSummary = {
  from?: MailTmAddress | null
  id: string
  intro?: string
  subject?: string
}

type MailTmMessageDetail = {
  createdAt?: string
  from?: MailTmAddress | null
  html?: string[]
  id: string
  intro?: string
  subject?: string
  text?: string
  to?: MailTmAddress[]
}

const DEFAULT_MAIL_TM_BASE_URL = "https://api.mail.tm"

function getMailTmBaseUrl() {
  return (process.env.ARCHIVE_PROVIDER_BASE_URL || DEFAULT_MAIL_TM_BASE_URL).replace(/\/+$/, "")
}

async function requestJson<T>(url: string, init: RequestInit, options: RequestOptions = {}): Promise<T> {
  if (options.beforeRequest) {
    await options.beforeRequest()
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json, application/ld+json",
        ...init.headers,
      },
    })

    if (!response.ok) {
      const error = new Error(`mail.tm request failed with status ${response.status}`)
      ;(error as Error & { status?: number }).status = response.status
      throw error
    }

    return (await response.json()) as T
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function mailTmCreateToken(
  input: { email: string; password: string },
  options: RequestOptions = {},
) {
  const payload = await requestJson<{ token?: string }>(
    `${getMailTmBaseUrl()}/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        address: input.email,
        password: input.password,
      }),
    },
    options,
  )

  if (!payload.token) {
    throw new Error("mail.tm token missing from response")
  }
  return payload.token
}

export async function mailTmListMessages(
  token: string,
  page = 1,
  options: RequestOptions = {},
): Promise<MailTmMessageSummary[]> {
  const payload = await requestJson<{ "hydra:member"?: MailTmMessageSummary[] }>(
    `${getMailTmBaseUrl()}/messages?page=${page}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
    options,
  )
  return payload["hydra:member"] || []
}

export async function mailTmGetMessageDetail(
  token: string,
  messageId: string,
  options: RequestOptions = {},
): Promise<MailTmMessageDetail> {
  return requestJson<MailTmMessageDetail>(
    `${getMailTmBaseUrl()}/messages/${messageId}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
    options,
  )
}
