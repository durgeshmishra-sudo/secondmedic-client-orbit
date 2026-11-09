import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`CURRENT_TIMESTAMP`;

export const crmMembers = sqliteTable("crm_members", {
  id: text("id").primaryKey(), authSubject: text("auth_subject").notNull().unique(),
  email: text("email").notNull().unique(), fullName: text("full_name").notNull(),
  role: text("role").notNull().default("staff"), teamName: text("team_name").notNull().default("General"),
  businessRole: text("business_role").notNull().default("bd"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true), temporaryPassword: text("temporary_password").notNull().default(""),
  forcePasswordChange: integer("force_password_change", { mode: "boolean" }).notNull().default(false), createdAt: text("created_at").notNull().default(now),
});

export const crmClients = sqliteTable("crm_clients", {
  id: text("id").primaryKey(), clientCode: text("client_code").notNull().unique(), legalName: text("legal_name").notNull(),
  contactName: text("contact_name").notNull().default(""), contactEmail: text("contact_email").notNull().default(""), contactPhone: text("contact_phone").notNull().default(""),
  industry: text("industry").notNull().default(""), segment: text("segment").notNull().default(""),
  leadSource: text("lead_source").notNull().default("Other"), city: text("city").notNull().default(""), status: text("status").notNull().default("prospect"),
  ownerMemberId: text("owner_member_id").references(() => crmMembers.id), teamName: text("team_name").notNull().default("General"), paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  notes: text("notes").notNull().default(""), createdByMemberId: text("created_by_member_id").notNull().references(() => crmMembers.id),
  createdAt: text("created_at").notNull().default(now), updatedAt: text("updated_at").notNull().default(now),
}, (t) => [index("crm_clients_owner_status_idx").on(t.ownerMemberId, t.status)]);

export const crmRevenueEntries = sqliteTable("crm_revenue_entries", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => crmClients.id),
  ownerMemberId: text("owner_member_id").notNull().references(() => crmMembers.id), entryDate: text("entry_date").notNull(),
  revenueMinor: integer("revenue_minor").notNull(), marginMinor: integer("margin_minor").notNull(),
  projectedRevenueMinor: integer("projected_revenue_minor").notNull().default(0),
  projectedMarginMinor: integer("projected_margin_minor").notNull().default(0),
  actualRevenueMinor: integer("actual_revenue_minor"),
  actualMarginMinor: integer("actual_margin_minor"),
  revenueMonth: text("revenue_month").notNull().default(""),
  // Nullable for historical entries. New project-month entries use this key
  // without conflating distinct projects with the same client name.
  pipelineItemId: text("pipeline_item_id"),
  actualUpdatedByMemberId: text("actual_updated_by_member_id").references(() => crmMembers.id),
  actualUpdatedAt: text("actual_updated_at"),
  description: text("description").notNull().default(""), status: text("status").notNull().default("projected"),
  createdAt: text("created_at").notNull().default(now),
}, (t) => [index("crm_revenue_client_date_idx").on(t.clientId, t.entryDate), index("crm_revenue_date_status_idx").on(t.entryDate, t.status), uniqueIndex("crm_revenue_pipeline_month_idx").on(t.pipelineItemId, t.revenueMonth)]);

export const crmPipelineItems = sqliteTable("crm_pipeline_items", {
  id: text("id").primaryKey(), clientId: text("client_id").references(() => crmClients.id), title: text("title").notNull(),
  ownerMemberId: text("owner_member_id").notNull().references(() => crmMembers.id), stage: text("stage").notNull().default("l1"), probability: integer("probability").notNull().default(20),
  expectedRevenueMinor: integer("expected_revenue_minor").notNull().default(0), expectedMarginMinor: integer("expected_margin_minor").notNull().default(0),
  expectedCloseDate: text("expected_close_date").notNull().default(""), nextAction: text("next_action").notNull().default(""),
  revenueId: text("revenue_id"), invoiceId: text("invoice_id"), lostAt: text("lost_at"), lostReason: text("lost_reason").notNull().default(""),
  leadSource: text("lead_source").notNull().default("Other"), stageEnteredAt: text("stage_entered_at"), completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(now), updatedAt: text("updated_at").notNull().default(now),
}, (t) => [index("crm_pipeline_owner_stage_idx").on(t.ownerMemberId, t.stage, t.expectedCloseDate)]);

export const crmPipelineSettings = sqliteTable("crm_pipeline_settings", {
  id: text("id").primaryKey(), probabilities: text("probabilities").notNull().default('{"l1":20,"l2":50,"l3":100,"l4":100,"l5":100}'),
  updatedByMemberId: text("updated_by_member_id").references(() => crmMembers.id), updatedAt: text("updated_at").notNull().default(now),
});

export const crmColdCalls = sqliteTable("crm_cold_calls", {
  id: text("id").primaryKey(), clientId: text("client_id").references(() => crmClients.id), prospectName: text("prospect_name").notNull().default(""),
  callerMemberId: text("caller_member_id").notNull().references(() => crmMembers.id), calledAt: text("called_at").notNull(),
  outcome: text("outcome").notNull().default("no_answer"), durationSeconds: integer("duration_seconds").notNull().default(0),
  nextFollowUpAt: text("next_followup_at").notNull().default(""), notes: text("notes").notNull().default(""), createdAt: text("created_at").notNull().default(now),
}, (t) => [index("crm_calls_member_date_idx").on(t.callerMemberId, t.calledAt)]);

export const crmMeetings = sqliteTable("crm_meetings", {
  id: text("id").primaryKey(), clientId: text("client_id").references(() => crmClients.id), organizerMemberId: text("organizer_member_id").notNull().references(() => crmMembers.id),
  title: text("title").notNull(), attendeeName: text("attendee_name").notNull().default(""), scheduledAt: text("scheduled_at").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(30), mode: text("mode").notNull().default("in_person"), status: text("status").notNull().default("scheduled"),
  locationOrLink: text("location_or_link").notNull().default(""), agenda: text("agenda").notNull().default(""), outcome: text("outcome").notNull().default(""), createdAt: text("created_at").notNull().default(now),
}, (t) => [index("crm_meetings_schedule_idx").on(t.scheduledAt, t.organizerMemberId)]);

export const crmInvoices = sqliteTable("crm_invoices", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => crmClients.id), invoiceNumber: text("invoice_number").notNull().unique(),
  issueDate: text("issue_date").notNull(), dueDate: text("due_date").notNull(), totalMinor: integer("total_minor").notNull(), status: text("status").notNull().default("sent"),
  notes: text("notes").notNull().default(""), createdByMemberId: text("created_by_member_id").notNull().references(() => crmMembers.id), createdAt: text("created_at").notNull().default(now),
}, (t) => [index("crm_invoices_client_due_idx").on(t.clientId, t.dueDate, t.status)]);

export const crmPayments = sqliteTable("crm_payments", {
  id: text("id").primaryKey(), invoiceId: text("invoice_id").notNull().references(() => crmInvoices.id), clientId: text("client_id").notNull().references(() => crmClients.id),
  receivedOn: text("received_on").notNull(), amountMinor: integer("amount_minor").notNull(), method: text("method").notNull().default("bank_transfer"),
  revenueMonth: text("revenue_month").notNull().default(""), tdsMinor: integer("tds_minor").notNull().default(0),
  referenceNo: text("reference_no").notNull().default(""), notes: text("notes").notNull().default(""), recordedByMemberId: text("recorded_by_member_id").notNull().references(() => crmMembers.id), createdAt: text("created_at").notNull().default(now),
}, (t) => [index("crm_payments_invoice_date_idx").on(t.invoiceId, t.receivedOn)]);

export const crmVendors = sqliteTable("crm_vendors", {
  id: text("id").primaryKey(), vendorName: text("vendor_name").notNull(), amountMinor: integer("amount_minor").notNull().default(0),
  clientId: text("client_id").notNull().references(() => crmClients.id), clientPayment: text("client_payment").notNull().default("no"),
  clientIds: text("client_ids").notNull().default("[]"), customerType: text("customer_type").notNull().default("direct_customer"),
  directCustomerName: text("direct_customer_name").notNull().default(""), staffMemberId: text("staff_member_id").references(() => crmMembers.id),
  proposedDate: text("proposed_date").notNull().default(""), invoiceDate: text("invoice_date").notNull().default(""),
  creditPeriodDays: integer("credit_period_days").notNull().default(30), vendorPaymentStatus: text("vendor_payment_status").notNull().default("unpaid"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  dueDate: text("due_date").notNull(), ownerMemberId: text("owner_member_id").notNull().references(() => crmMembers.id), notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(now), updatedAt: text("updated_at").notNull().default(now),
}, (t) => [index("crm_vendors_client_due_idx").on(t.clientId, t.dueDate), index("crm_vendors_owner_idx").on(t.ownerMemberId, t.dueDate)]);

export const crmDocuments = sqliteTable("crm_documents", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => crmClients.id), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(),
  documentKind: text("document_kind").notNull(), objectKey: text("object_key").notNull().unique(), originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(), sizeBytes: integer("size_bytes").notNull(), uploadedByMemberId: text("uploaded_by_member_id").notNull().references(() => crmMembers.id),
  uploadedAt: text("uploaded_at").notNull().default(now), deletedAt: text("deleted_at"),
}, (t) => [index("crm_documents_client_kind_idx").on(t.clientId, t.documentKind)]);

export const crmAgreements = sqliteTable("crm_agreements", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => crmClients.id), title: text("title").notNull(),
  agreementNumber: text("agreement_number").notNull().default(""), status: text("status").notNull().default("pending_signature"), effectiveDate: text("effective_date").notNull().default(""),
  expiryDate: text("expiry_date").notNull().default(""), valueMinor: integer("value_minor").notNull().default(0), summary: text("summary").notNull().default(""), paymentTerms: text("payment_terms").notNull().default(""), renewalTerms: text("renewal_terms").notNull().default(""), ownerMemberId: text("owner_member_id").notNull().references(() => crmMembers.id), createdAt: text("created_at").notNull().default(now),
}, (t) => [index("crm_agreements_expiry_idx").on(t.status, t.expiryDate)]);

export const crmActivityEvents = sqliteTable("crm_activity_events", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => crmClients.id), actorMemberId: text("actor_member_id").references(() => crmMembers.id),
  eventType: text("event_type").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), body: text("body").notNull().default(""), occurredAt: text("occurred_at").notNull().default(now),
}, (t) => [index("crm_activity_client_date_idx").on(t.clientId, t.occurredAt)]);

export const crmActivityLog = sqliteTable("crm_activity_log", {
  id: text("id").primaryKey(), occurredAt: text("occurred_at").notNull().default(now),
  actorMemberId: text("actor_member_id").references(() => crmMembers.id), actorName: text("actor_name").notNull().default(""),
  actorRole: text("actor_role").notNull().default("staff"), teamName: text("team_name").notNull().default(""),
  module: text("module").notNull(), action: text("action").notNull(), recordType: text("record_type").notNull().default(""),
  recordId: text("record_id").notNull().default(""), oldValue: text("old_value").notNull().default(""),
  newValue: text("new_value").notNull().default(""), details: text("details").notNull().default(""),
}, (t) => [index("crm_activity_log_date_idx").on(t.occurredAt), index("crm_activity_log_actor_idx").on(t.actorMemberId), index("crm_activity_log_module_idx").on(t.module, t.action)]);

export const crmWriteRequests = sqliteTable("crm_write_requests", {
  operationKey: text("operation_key").primaryKey(), actorMemberId: text("actor_member_id").notNull(),
  payloadHash: text("payload_hash").notNull(), state: text("state").notNull().default("pending"),
  responseJson: text("response_json").notNull().default(""), statusCode: integer("status_code").notNull().default(0),
  createdAt: text("created_at").notNull().default(now), updatedAt: text("updated_at").notNull().default(now),
}, (t) => [index("crm_write_requests_actor_date_idx").on(t.actorMemberId, t.createdAt)]);
