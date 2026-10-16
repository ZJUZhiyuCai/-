CREATE TABLE `projects` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`revision` integer NOT NULL,
	`object_key` text NOT NULL,
	`history` text NOT NULL,
	`updated_at` text NOT NULL,
	`block_count` integer NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
