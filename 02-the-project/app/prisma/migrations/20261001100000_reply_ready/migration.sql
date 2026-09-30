-- A reply is ready for a person to send. Its own migration because a new
-- enum value cannot be used in the transaction that adds it.
ALTER TYPE "NotificationKind" ADD VALUE 'REPLY_READY';
