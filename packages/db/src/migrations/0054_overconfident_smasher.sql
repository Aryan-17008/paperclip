ALTER TABLE "task_routing_decisions" ADD COLUMN "agent_input_tokens" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "task_routing_decisions" ADD COLUMN "agent_output_tokens" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "task_routing_decisions" ADD COLUMN "agent_model" text;--> statement-breakpoint
ALTER TABLE "task_routing_decisions" ADD COLUMN "cost_source" text;