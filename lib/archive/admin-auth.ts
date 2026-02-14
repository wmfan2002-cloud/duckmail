import type { NextRequest } from "next/server"

export function checkArchiveAdminToken(request: NextRequest) {
  const configured = process.env.ARCHIVE_ADMIN_TOKEN
  if (!configured) {
    return true
  }

  const headerToken =
    request.headers.get("x-archive-admin-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  return headerToken === configured
}
