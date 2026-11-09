CREATE TABLE `crm_activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`actor_member_id` text,
	`actor_name` text DEFAULT '' NOT NULL,
	`actor_role` text DEFAULT 'staff' NOT NULL,
	`team_name` text DEFAULT '' NOT NULL,
	`module` text NOT NULL,
	`action` text NOT NULL,
	`record_type` text DEFAULT '' NOT NULL,
	`record_id` text DEFAULT '' NOT NULL,
	`old_value` text DEFAULT '' NOT NULL,
	`new_value` text DEFAULT '' NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`actor_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_activity_log_date_idx` ON `crm_activity_log` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `crm_activity_log_actor_idx` ON `crm_activity_log` (`actor_member_id`);--> statement-breakpoint
CREATE INDEX `crm_activity_log_module_idx` ON `crm_activity_log` (`module`,`action`);--> statement-breakpoint
CREATE TABLE `crm_write_requests` (
	`operation_key` text PRIMARY KEY NOT NULL,
	`actor_member_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`response_json` text DEFAULT '' NOT NULL,
	`status_code` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `crm_write_requests_actor_date_idx` ON `crm_write_requests` (`actor_member_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `crm_clients` ADD `segment` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_clients` ADD `lead_source` text DEFAULT 'Other' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_members` ADD `business_role` text DEFAULT 'bd' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_payments` ADD `revenue_month` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_payments` ADD `tds_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_pipeline_items` ADD `lead_source` text DEFAULT 'Other' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_pipeline_items` ADD `stage_entered_at` text;--> statement-breakpoint
ALTER TABLE `crm_pipeline_items` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `crm_revenue_entries` ADD `pipeline_item_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `crm_revenue_pipeline_month_idx` ON `crm_revenue_entries` (`pipeline_item_id`,`revenue_month`);--> statement-breakpoint
ALTER TABLE `crm_vendors` ADD `client_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_vendors` ADD `customer_type` text DEFAULT 'direct_customer' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_vendors` ADD `direct_customer_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_vendors` ADD `staff_member_id` text REFERENCES crm_members(id);--> statement-breakpoint
ALTER TABLE `crm_vendors` ADD `proposed_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_vendors` ADD `invoice_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_vendors` ADD `credit_period_days` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_vendors` ADD `vendor_payment_status` text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_vendors` ADD `payment_status` text DEFAULT 'unpaid' NOT NULL;