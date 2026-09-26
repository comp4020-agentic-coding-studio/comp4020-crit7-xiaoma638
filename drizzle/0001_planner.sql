CREATE TABLE `courses` (
	`code` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`units` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `degrees` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`total_units` integer NOT NULL,
	`duration_years` integer NOT NULL,
	`source_url` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_choices` (
	`plan_id` text NOT NULL,
	`choice_id` text NOT NULL,
	`option_id` text NOT NULL,
	PRIMARY KEY(`plan_id`, `choice_id`),
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plan_courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` text NOT NULL,
	`course_code` text NOT NULL,
	`term` text NOT NULL,
	`units` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_course_term` ON `plan_courses` (`plan_id`,`course_code`,`term`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`degree_code` text NOT NULL,
	`start_year` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`degree_code`) REFERENCES `degrees`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requirement_courses` (
	`requirement_id` text NOT NULL,
	`course_code` text NOT NULL,
	`times` integer DEFAULT 1 NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`requirement_id`, `course_code`),
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `requirement_exclusions` (
	`requirement_id` text NOT NULL,
	`course_code` text NOT NULL,
	PRIMARY KEY(`requirement_id`, `course_code`),
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`degree_code` text NOT NULL,
	`parent_id` text,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`note` text,
	`min_units` integer,
	`max_units` integer,
	`subjects` text,
	`level_min` integer,
	`level_max` integer,
	`scope` text,
	FOREIGN KEY (`degree_code`) REFERENCES `degrees`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `requirements_degree` ON `requirements` (`degree_code`);