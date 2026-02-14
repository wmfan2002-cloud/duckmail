import { randomUUID } from "crypto"

import { getArchivePool } from "@/lib/archive/db"

async function main() {
  const pool = getArchivePool()
  const client = await pool.connect()
  const seedEmail = `smoke-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`
  try {
    await client.query("BEGIN")
    const insertResult = await client.query<{ id: number; email: string }>(
      `INSERT INTO mailboxes (email, password_enc, provider) VALUES ($1, $2, $3) RETURNING id, email;`,
      [seedEmail, "smoke_encrypted_secret", "smoke"],
    )
    const inserted = insertResult.rows[0]
    const queryResult = await client.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM mailboxes WHERE id = $1;`,
      [inserted.id],
    )
    await client.query("ROLLBACK")
    console.log(
      `[archive] smoke ok insertedMailboxId=${inserted.id} email=${inserted.email} count=${queryResult.rows[0].total}`,
    )
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error("[archive] smoke failed:", error.message)
  process.exit(1)
})
