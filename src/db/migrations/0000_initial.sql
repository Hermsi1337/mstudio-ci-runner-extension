CREATE TYPE "public"."context" AS ENUM('customer', 'project');--> statement-breakpoint
CREATE TABLE "extension_instance" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"contextId" varchar(36) NOT NULL,
	"context" "context" DEFAULT 'project' NOT NULL,
	"active" boolean NOT NULL,
	"variant_key" text,
	"consented_scopes" text[] NOT NULL,
	"secret" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runner_stacks" (
	"stackId" varchar(36) PRIMARY KEY NOT NULL,
	"extensionInstanceId" varchar(36) NOT NULL,
	"projectId" varchar(36) NOT NULL,
	"targetUrl" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "runner_stacks_extensionInstanceId_targetUrl_unique" UNIQUE("extensionInstanceId","targetUrl")
);
--> statement-breakpoint
CREATE TABLE "runners" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"extensionInstanceId" varchar(36) NOT NULL,
	"projectId" varchar(36) NOT NULL,
	"stackId" varchar(36) NOT NULL,
	"serviceName" varchar(63) DEFAULT 'runner' NOT NULL,
	"serviceId" varchar(64),
	"provider" varchar(32) NOT NULL,
	"name" varchar(64) NOT NULL,
	"target" text NOT NULL,
	"targetUrl" text NOT NULL,
	"credentials" text NOT NULL,
	"labels" text NOT NULL,
	"ephemeral" boolean DEFAULT false NOT NULL,
	"tokenType" varchar(16) DEFAULT 'registration' NOT NULL,
	"size" varchar(16) DEFAULT 'medium' NOT NULL,
	"cpus" real,
	"memoryMb" integer,
	"image" text,
	"runnerVersion" varchar(32),
	"cache" boolean DEFAULT false NOT NULL,
	"cacheSizeGb" integer DEFAULT 10 NOT NULL,
	"concurrency" integer DEFAULT 1 NOT NULL,
	"cronjobIds" text DEFAULT '[]' NOT NULL,
	"createdBy" varchar(36) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runner_stacks" ADD CONSTRAINT "runner_stacks_extensionInstanceId_extension_instance_id_fk" FOREIGN KEY ("extensionInstanceId") REFERENCES "public"."extension_instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runners" ADD CONSTRAINT "runners_extensionInstanceId_extension_instance_id_fk" FOREIGN KEY ("extensionInstanceId") REFERENCES "public"."extension_instance"("id") ON DELETE cascade ON UPDATE no action;