CREATE TABLE `crm_pipeline_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`probabilities` text DEFAULT '{"l1":20,"l2":50,"l3":100,"l4":100,"l5":100}' NOT NULL,
	`updated_by_member_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`updated_by_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_crm_pipeline_items` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`title` text NOT NULL,
	`owner_member_id` text NOT NULL,
	`stage` text DEFAULT 'l1' NOT NULL,
	`probability` integer DEFAULT 20 NOT NULL,
	`expected_revenue_minor` integer DEFAULT 0 NOT NULL,
	`expected_margin_minor` integer DEFAULT 0 NOT NULL,
	`expected_close_date` text DEFAULT '' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`revenue_id` text,
	`invoice_id` text,
	`lost_at` text,
	`lost_reason` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `crm_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_crm_pipeline_items`("id", "client_id", "title", "owner_member_id", "stage", "probability", "expected_revenue_minor", "expected_margin_minor", "expected_close_date", "next_action", "revenue_id", "invoice_id", "lost_at", "lost_reason", "created_at", "updated_at") SELECT "id", "client_id", "title", "owner_member_id", "stage", "probability", "expected_revenue_minor", "expected_margin_minor", "expected_close_date", "next_action", "revenue_id", "invoice_id", "lost_at", "lost_reason", "created_at", "updated_at" FROM `crm_pipeline_items`;--> statement-breakpoint
DROP TABLE `crm_pipeline_items`;--> statement-breakpoint
ALTER TABLE `__new_crm_pipeline_items` RENAME TO `crm_pipeline_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `crm_pipeline_owner_stage_idx` ON `crm_pipeline_items` (`owner_member_id`,`stage`,`expected_close_date`);--> statement-breakpoint
ALTER TABLE `crm_agreements` ADD `payment_terms` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_agreements` ADD `renewal_terms` text DEFAULT '' NOT NULL;