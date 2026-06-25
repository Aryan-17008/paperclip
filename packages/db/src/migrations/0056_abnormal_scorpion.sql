ALTER TABLE "task_routing_decisions" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "task_routing_decisions" ADD COLUMN "estimated_latency_ms" integer;--> statement-breakpoint
ALTER TABLE "task_routing_decisions" ADD COLUMN "prompt_hash" text;--> statement-breakpoint
ALTER TABLE "task_routing_decisions" ADD COLUMN "cache_hit" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "task_routing_decisions" ADD COLUMN "cache_similarity_score" real DEFAULT 0;--> statement-breakpoint
CREATE INDEX "routing_decisions_prompt_hash_idx" ON "task_routing_decisions" USING btree ("prompt_hash");--> statement-breakpoint
CREATE INDEX "routing_decisions_company_cache_hit_idx" ON "task_routing_decisions" USING btree ("company_id","cache_hit","created_at");