CREATE TABLE "docker_api_stacks" (
	"stackId" varchar(36) PRIMARY KEY NOT NULL,
	"extensionInstanceId" varchar(36) NOT NULL,
	"projectId" varchar(36) NOT NULL,
	"nonce" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "dockerApi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "docker_api_stacks" ADD CONSTRAINT "docker_api_stacks_extensionInstanceId_extension_instance_id_fk" FOREIGN KEY ("extensionInstanceId") REFERENCES "public"."extension_instance"("id") ON DELETE cascade ON UPDATE no action;