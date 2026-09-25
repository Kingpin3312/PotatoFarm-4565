-- A suggestion to put somebody who said "later" on a nurture plan. Its
-- own migration because a new enum value cannot be used in the
-- transaction that adds it.
ALTER TYPE "NextAction" ADD VALUE 'START_PLAN';
