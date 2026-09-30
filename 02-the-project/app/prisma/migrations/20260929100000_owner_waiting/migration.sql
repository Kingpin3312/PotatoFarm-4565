-- A property owner wrote and nobody has answered. Its own migration
-- because a new enum value cannot be used in the transaction that adds it.
ALTER TYPE "NotificationKind" ADD VALUE 'OWNER_WAITING';
