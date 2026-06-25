CREATE TABLE "task_routing_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid,
	"complexity" text NOT NULL,
	"classified_role" text NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"classification_reason" text,
	"routed_agent_id" uuid,
	"routed_agent_role" text NOT NULL,
	"was_overridden" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"classifier_input_tokens" integer DEFAULT 0 NOT NULL,
	"classifier_output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_savings_percent" integer DEFAULT 0 NOT NULL,
	"cost_estimate_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_routing_decisions" ADD CONSTRAINT "task_routing_decisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_routing_decisions" ADD CONSTRAINT "task_routing_decisions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_routing_decisions" ADD CONSTRAINT "task_routing_decisions_routed_agent_id_agents_id_fk" FOREIGN KEY ("routed_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routing_decisions_company_created_idx" ON "task_routing_decisions" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "routing_decisions_company_issue_idx" ON "task_routing_decisions" USING btree ("company_id","issue_id");--> statement-breakpoint
CREATE INDEX "routing_decisions_company_complexity_idx" ON "task_routing_decisions" USING btree ("company_id","complexity");--> statement-breakpoint
CREATE INDEX "routing_decisions_company_agent_idx" ON "task_routing_decisions" USING btree ("company_id","routed_agent_id");