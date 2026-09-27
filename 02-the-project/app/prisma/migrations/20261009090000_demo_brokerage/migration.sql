-- A demonstration brokerage (additive). Set by the seed and by operators,
-- never from the application: nothing it sends reaches WhatsApp, and it can
-- take a simulated enquiry through the real intake so a prospect can watch
-- the assistant answer one.
ALTER TABLE "Organisation" ADD COLUMN "demo" BOOLEAN NOT NULL DEFAULT false;
