exports.config = {
  schedule: "*/10 * * * *",
}

exports.handler = async function handler() {
  const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL
  if (!baseUrl) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        code: "MISSING_BASE_URL",
        error: "Missing URL/DEPLOY_PRIME_URL/DEPLOY_URL in environment",
      }),
    }
  }

  const endpoint = `${baseUrl.replace(/\/$/, "")}/api/archive/sync/scheduled`
  const headers = {
    "content-type": "application/json",
  }
  if (process.env.ARCHIVE_ADMIN_TOKEN) {
    headers["x-archive-admin-token"] = process.env.ARCHIVE_ADMIN_TOKEN
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    })
    const body = await response.text()
    return {
      statusCode: response.ok ? 200 : response.status,
      body,
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        code: "SCHEDULE_TRIGGER_FAILED",
        error: error instanceof Error ? error.message : "unknown error",
      }),
    }
  }
}
