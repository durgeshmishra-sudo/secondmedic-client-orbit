ALTER TABLE `crm_revenue_entries` ADD `projected_revenue_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_revenue_entries` ADD `projected_margin_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_revenue_entries` ADD `actual_revenue_minor` integer;--> statement-breakpoint
ALTER TABLE `crm_revenue_entries` ADD `actual_margin_minor` integer;--> statement-breakpoint
ALTER TABLE `crm_revenue_entries` ADD `revenue_month` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_revenue_entries` ADD `actual_updated_by_member_id` text REFERENCES `crm_members`(`id`);--> statement-breakpoint
ALTER TABLE `crm_revenue_entries` ADD `actual_updated_at` text;
