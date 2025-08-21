import { pgTable, serial, text, varchar, timestamp, integer, boolean, jsonb, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";

// Tenancy & auth
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("America/New_York"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  hash: text("hash").notNull(),
  role: varchar("role", { length: 20 }).default("member"), // owner, admin, member
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  emailIdx: uniqueIndex("users_email_idx").on(t.email)
}));

// Billing & usage
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 32 }).notNull(), // FREE, STARTER, PRO
  monthlyLimit: integer("monthly_limit").notNull(), // stitched leads
  priceUsd: integer("price_usd").notNull(), // 0, 10, 20
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  planId: integer("plan_id").references(() => plans.id).notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 64 }),
  stripeSubId: varchar("stripe_sub_id", { length: 64 }),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: varchar("status", { length: 32 }).notNull(), // active, past_due, canceled
});

export const usageCounters = pgTable("usage_counters", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  stitchedCount: integer("stitched_count").default(0).notNull(),
}, (t) => ({
  acctPeriodIdx: uniqueIndex("usage_account_period_idx").on(t.accountId, t.periodStart, t.periodEnd)
}));

// Upload & mapping
export const uploads = pgTable("uploads", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  bytes: integer("bytes").notNull(),
  detectedType: varchar("detected_type", { length: 40 }), // forms, calls, chats, appts, invoices, unknown
  status: varchar("status", { length: 20 }).default("uploaded"), // uploaded, parsed, normalized, matched, failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mappingTemplates = pgTable("mapping_templates", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  name: varchar("name", { length: 120 }).notNull(), // "CallRail Standard", etc.
  sourceType: varchar("source_type", { length: 40 }).notNull(),
  columnMap: jsonb("column_map").notNull(), // { "start_time":"timestamp", "caller_phone":"phone", ... }
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Normalized rows (one row per source record)
export const normalizedRows = pgTable("normalized_rows", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  uploadId: integer("upload_id").references(() => uploads.id).notNull(),
  sourceType: varchar("source_type", { length: 40 }).notNull(),
  // canonical fields
  occurredAt: timestamp("occurred_at").notNull(),
  name: varchar("name", { length: 160 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  gclid: varchar("gclid", { length: 128 }),
  clientId: varchar("client_id", { length: 64 }),
  utmSource: varchar("utm_source", { length: 80 }),
  utmMedium: varchar("utm_medium", { length: 80 }),
  utmCampaign: varchar("utm_campaign", { length: 160 }),
  landingPage: text("landing_page"),
  location: varchar("location", { length: 120 }),
  durationSec: integer("duration_sec"), // calls
  amount: numeric("amount", { precision: 12, scale: 2 }), // invoices
  externalId: varchar("external_id", { length: 128 }), // job_id, deal_id etc.
  original: jsonb("original").notNull(), // entire original row for audit
}, (t) => ({
  acctTimeIdx: index("normrows_account_time_idx").on(t.accountId, t.occurredAt),
  acctPhoneIdx: index("normrows_account_phone_idx").on(t.accountId, t.phone),
  acctEmailIdx: index("normrows_account_email_idx").on(t.accountId, t.email),
}));

// Stitched entity (one row per lead)
export const stitchedLeads = pgTable("stitched_leads", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  stitchId: varchar("stitch_id", { length: 64 }).notNull(), // ULID
  createdAt: timestamp("created_at").defaultNow().notNull(), // time first seen
  leadCreatedAt: timestamp("lead_created_at").notNull(), // earliest occurredAt among linked rows
  name: varchar("name", { length: 160 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  location: varchar("location", { length: 120 }),
  revenue: numeric("revenue", { precision: 12, scale: 2 }).default("0"),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).default("0.0"),
  // attribution
  finalChannel: varchar("final_channel", { length: 80 }),
  finalSource: varchar("final_source", { length: 80 }),
  finalMedium: varchar("final_medium", { length: 80 }),
  finalCampaign: varchar("final_campaign", { length: 160 }),
  firstTouchSource: varchar("first_touch_source", { length: 80 }),
  lastTouchSource: varchar("last_touch_source", { length: 80 }),
  paidLastSource: varchar("paid_last_source", { length: 80 }),
}, (t) => ({
  acctStitchIdx: uniqueIndex("acct_stitchid_idx").on(t.accountId, t.stitchId)
}));

export const stitchLinks = pgTable("stitch_links", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  stitchId: integer("stitch_id").references(() => stitchedLeads.id).notNull(),
  normalizedRowId: integer("normalized_row_id").references(() => normalizedRows.id).notNull(),
  matchPass: varchar("match_pass", { length: 24 }).notNull(), // P1,P2,P3,P4
  matchedOn: jsonb("matched_on").notNull(), // {keys:["phone","email"], windowDays:30}
  reason: text("reason"),
});

export const auditTrail = pgTable("audit_trail", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  stitchId: integer("stitch_id").references(() => stitchedLeads.id).notNull(),
  sourceFile: varchar("source_file", { length: 255 }),
  originalRowId: integer("original_row_id"), // optional pointer if stored
  matchedOn: jsonb("matched_on").notNull(),
  matchPass: varchar("match_pass", { length: 24 }).notNull(),
  reason: text("reason"),
});

// Policy presets
export const policies = pgTable("policies", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  yaml: text("yaml").notNull(), // full policy document
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Export jobs
export const exportJobs = pgTable("export_jobs", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  status: varchar("status", { length: 20 }).default("queued"), // queued, running, done, failed
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  resultUrl: text("result_url"), // signed URL (optional) or immediate download stream
  meta: jsonb("meta").notNull(), // {policyId, timeframe, columns}
});

// Type exports for use in application
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type UsageCounter = typeof usageCounters.$inferSelect;
export type NewUsageCounter = typeof usageCounters.$inferInsert;
export type Upload = typeof uploads.$inferSelect;
export type NewUpload = typeof uploads.$inferInsert;
export type MappingTemplate = typeof mappingTemplates.$inferSelect;
export type NewMappingTemplate = typeof mappingTemplates.$inferInsert;
export type NormalizedRow = typeof normalizedRows.$inferSelect;
export type NewNormalizedRow = typeof normalizedRows.$inferInsert;
export type StitchedLead = typeof stitchedLeads.$inferSelect;
export type NewStitchedLead = typeof stitchedLeads.$inferInsert;
export type StitchLink = typeof stitchLinks.$inferSelect;
export type NewStitchLink = typeof stitchLinks.$inferInsert;
export type AuditTrail = typeof auditTrail.$inferSelect;
export type NewAuditTrail = typeof auditTrail.$inferInsert;
export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;
export type ExportJob = typeof exportJobs.$inferSelect;
export type NewExportJob = typeof exportJobs.$inferInsert;

