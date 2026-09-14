CREATE TABLE "runner_stacks" (
	"stackId" varchar(36) PRIMARY KEY NOT NULL,
	"extensionInstanceId" varchar(36) NOT NULL,
	"projectId" varchar(36) NOT NULL,
	"targetUrl" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "runner_stacks_extensionInstanceId_targetUrl_unique" UNIQUE("extensionInstanceId","targetUrl")
);
--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "serviceName" varchar(63) DEFAULT 'runner' NOT NULL;--> statement-breakpoint
ALTER TABLE "runner_stacks" ADD CONSTRAINT "runner_stacks_extensionInstanceId_extension_instance_id_fk" FOREIGN KEY ("extensionInstanceId") REFERENCES "public"."extension_instance"("id") ON DELETE cascade ON UPDATE no action;