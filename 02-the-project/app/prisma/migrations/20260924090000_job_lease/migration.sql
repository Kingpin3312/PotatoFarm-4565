-- A lease per scheduled job, replacing a session-level advisory lock.
--
-- pg_advisory_lock belongs to the connection that took it. The runner
-- took it on one pooled connection and released it on whichever the pool
-- handed out next, so after any run that opened more than one connection
-- the lock stayed held and every later run of that job in the process was
-- skipped as "already running". Behind a transaction-mode pooler, which
-- DEPLOY.md requires, that is nearly every run.
--
-- A row is taken and released by single statements that work on any
-- connection, and expires on its own if the process holding it dies.
CREATE TABLE "JobLease" (
    "job" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLease_pkey" PRIMARY KEY ("job")
);
