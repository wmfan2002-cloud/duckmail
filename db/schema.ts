import {
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    passwordEnc: text("password_enc").notNull(),
    provider: text("provider").notNull().default("mail.tm"),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(null),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex("mailboxes_email_unique").on(table.email),
    activeIdx: index("mailboxes_is_active_idx").on(table.isActive),
  }),
)

export const messages = pgTable(
  "messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    mailboxId: bigint("mailbox_id", { mode: "number" })
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    remoteId: text("remote_id").notNull(),
    subject: text("subject"),
    fromAddress: text("from_address"),
    toAddresses: jsonb("to_addresses").$type<string[] | null>().default(null),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueRemotePerMailbox: uniqueIndex("messages_mailbox_id_remote_id_unique").on(
      table.mailboxId,
      table.remoteId,
    ),
    mailboxReceivedIdx: index("messages_mailbox_received_at_idx").on(table.mailboxId, table.receivedAt),
    fromAddressIdx: index("messages_from_address_idx").on(table.fromAddress),
    subjectIdx: index("messages_subject_idx").on(table.subject),
  }),
)

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    mailboxId: bigint("mailbox_id", { mode: "number" })
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    triggerType: text("trigger_type").notNull(),
    status: text("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    stats: jsonb("stats").$type<Record<string, unknown> | null>().default(null),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    mailboxCreatedIdx: index("sync_runs_mailbox_id_created_at_idx").on(table.mailboxId, table.createdAt),
    statusIdx: index("sync_runs_status_idx").on(table.status),
  }),
)

export const syncEvents = pgTable(
  "sync_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: bigint("run_id", { mode: "number" })
      .notNull()
      .references(() => syncRuns.id, { onDelete: "cascade" }),
    mailboxId: bigint("mailbox_id", { mode: "number" })
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    level: text("level").notNull().default("info"),
    code: text("code"),
    message: text("message").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown> | null>().default(null),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    runCreatedIdx: index("sync_events_run_id_created_at_idx").on(table.runId, table.createdAt),
    mailboxCreatedIdx: index("sync_events_mailbox_id_created_at_idx").on(table.mailboxId, table.createdAt),
  }),
)

export const archiveSettings = pgTable(
  "archive_settings",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").$type<Record<string, unknown> | null>().default(null),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    updatedAtIdx: index("archive_settings_updated_at_idx").on(table.updatedAt),
  }),
)

export const schema = {
  mailboxes,
  messages,
  syncRuns,
  syncEvents,
  archiveSettings,
}

export type Mailbox = typeof mailboxes.$inferSelect
export type Message = typeof messages.$inferSelect
export type SyncRun = typeof syncRuns.$inferSelect
export type SyncEvent = typeof syncEvents.$inferSelect
export type ArchiveSetting = typeof archiveSettings.$inferSelect
