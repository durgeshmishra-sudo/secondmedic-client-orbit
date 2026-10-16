ALTER TABLE `crm_clients` ADD `payment_terms_days` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_members` ADD `temporary_password` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_members` ADD `force_password_change` integer DEFAULT false NOT NULL;