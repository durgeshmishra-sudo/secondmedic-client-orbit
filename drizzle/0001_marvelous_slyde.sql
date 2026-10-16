CREATE TABLE `crm_vendors` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_name` text NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`client_id` text NOT NULL,
	`client_payment` text DEFAULT 'no' NOT NULL,
	`due_date` text NOT NULL,
	`owner_member_id` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `crm_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_member_id`) REFERENCES `crm_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_vendors_client_due_idx` ON `crm_vendors` (`client_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `crm_vendors_owner_idx` ON `crm_vendors` (`owner_member_id`,`due_date`);