CREATE TABLE `crm_activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`actor_member_id` text,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `crm_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_activity_client_date_idx` ON `crm_activity_events` (`client_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `crm_agreements` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`title` text NOT NULL,
	`agreement_number` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending_signature' NOT NULL,
	`effective_date` text DEFAULT '' NOT NULL,
	`expiry_date` text DEFAULT '' NOT NULL,
	`value_minor` integer DEFAULT 0 NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`owner_member_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `crm_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_agreements_expiry_idx` ON `crm_agreements` (`status`,`expiry_date`);--> statement-breakpoint
CREATE TABLE `crm_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`client_code` text NOT NULL,
	`legal_name` text NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`contact_phone` text DEFAULT '' NOT NULL,
	`industry` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'prospect' NOT NULL,
	`owner_member_id` text,
	`team_name` text DEFAULT 'General' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by_member_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_clients_client_code_unique` ON `crm_clients` (`client_code`);--> statement-breakpoint
CREATE INDEX `crm_clients_owner_status_idx` ON `crm_clients` (`owner_member_id`,`status`);--> statement-breakpoint
CREATE TABLE `crm_cold_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`prospect_name` text DEFAULT '' NOT NULL,
	`caller_member_id` text NOT NULL,
	`called_at` text NOT NULL,
	`outcome` text DEFAULT 'no_answer' NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`next_followup_at` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `crm_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`caller_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_calls_member_date_idx` ON `crm_cold_calls` (`caller_member_id`,`called_at`);--> statement-breakpoint
CREATE TABLE `crm_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`document_kind` text NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by_member_id` text NOT NULL,
	`uploaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`client_id`) REFERENCES `crm_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_documents_object_key_unique` ON `crm_documents` (`object_key`);--> statement-breakpoint
CREATE INDEX `crm_documents_client_kind_idx` ON `crm_documents` (`client_id`,`document_kind`);--> statement-breakpoint
CREATE TABLE `crm_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`invoice_number` text NOT NULL,
	`issue_date` text NOT NULL,
	`due_date` text NOT NULL,
	`total_minor` integer NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by_member_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `crm_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_invoices_invoice_number_unique` ON `crm_invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `crm_invoices_client_due_idx` ON `crm_invoices` (`client_id`,`due_date`,`status`);--> statement-breakpoint
CREATE TABLE `crm_meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`organizer_member_id` text NOT NULL,
	`title` text NOT NULL,
	`attendee_name` text DEFAULT '' NOT NULL,
	`scheduled_at` text NOT NULL,
	`duration_minutes` integer DEFAULT 30 NOT NULL,
	`mode` text DEFAULT 'in_person' NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`location_or_link` text DEFAULT '' NOT NULL,
	`agenda` text DEFAULT '' NOT NULL,
	`outcome` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `crm_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organizer_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_meetings_schedule_idx` ON `crm_meetings` (`scheduled_at`,`organizer_member_id`);--> statement-breakpoint
CREATE TABLE `crm_members` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_subject` text NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`team_name` text DEFAULT 'General' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_members_auth_subject_unique` ON `crm_members` (`auth_subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `crm_members_email_unique` ON `crm_members` (`email`);--> statement-breakpoint
CREATE TABLE `crm_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`client_id` text NOT NULL,
	`received_on` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`method` text DEFAULT 'bank_transfer' NOT NULL,
	`reference_no` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`recorded_by_member_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `crm_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `crm_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_payments_invoice_date_idx` ON `crm_payments` (`invoice_id`,`received_on`);--> statement-breakpoint
CREATE TABLE `crm_pipeline_items` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`title` text NOT NULL,
	`owner_member_id` text NOT NULL,
	`stage` text DEFAULT 'lead' NOT NULL,
	`probability` integer DEFAULT 10 NOT NULL,
	`expected_revenue_minor` integer DEFAULT 0 NOT NULL,
	`expected_margin_minor` integer DEFAULT 0 NOT NULL,
	`expected_close_date` text DEFAULT '' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `crm_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_pipeline_owner_stage_idx` ON `crm_pipeline_items` (`owner_member_id`,`stage`,`expected_close_date`);--> statement-breakpoint
CREATE TABLE `crm_revenue_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`owner_member_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`revenue_minor` integer NOT NULL,
	`margin_minor` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `crm_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_revenue_client_date_idx` ON `crm_revenue_entries` (`client_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `crm_revenue_date_status_idx` ON `crm_revenue_entries` (`entry_date`,`status`);