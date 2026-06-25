ALTER TABLE "task_routing_decisions" ADD COLUMN "failover_model" text;--> statement-breakpoint
ALTER TABLE "task_routing_decisions" ADD COLUMN "failover_reason" text;--> statement-breakpoint
ALTER TABLE "task_routing_decisions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;