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
CREATE TABLE "runners" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"extensionInstanceId" varchar(36) NOT NULL,
	"projectId" varchar(36) NOT NULL,
	"stackId" varchar(36) NOT NULL,
	"serviceId" varchar(64),
	"provider" varchar(32) NOT NULL,
	"name" varchar(64) NOT NULL,
	"target" text NOT NULL,
	"targetUrl" text NOT NULL,
	"credentials" text NOT NULL,
	"labels" text NOT NULL,
	"ephemeral" boolean DEFAULT false NOT NULL,
	"size" varchar(16) DEFAULT 'medium' NOT NULL,
	"createdBy" varchar(36) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runners" ADD CONSTRAINT "runners_extensionInstanceId_extension_instance_id_fk" FOREIGN KEY ("extensionInstanceId") REFERENCES "public"."extension_instance"("id") ON DELETE cascade ON UPDATE no action;