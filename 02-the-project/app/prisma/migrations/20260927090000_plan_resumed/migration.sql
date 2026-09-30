-- When an agent restarted a plan that a reply had paused. Additive and
-- nullable: a plan never resumed reads its replies from `startedAt`, as
-- before.
ALTER TABLE "PlanSubscription" ADD COLUMN "resumedAt" TIMESTAMP(3);
