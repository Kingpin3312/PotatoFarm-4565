-- Notifications about a viewing linked to `/viewings/<id>`, a page that
-- has never existed. The diary now takes a day and each card an anchor;
-- point the ones already sent at them, so an agent opening an old
-- "How did the viewing go?" lands on the viewing rather than a 404.
UPDATE "Notification" n
SET "deeplink" = '/viewings?date=' || to_char(v."scheduledAt", 'YYYY-MM-DD') || '#viewing-' || v."id"
FROM "Viewing" v
WHERE n."deeplink" LIKE '/viewings/%' AND n."subjectId" = v."id";

-- Anything left pointing at the missing page goes to the diary.
UPDATE "Notification" SET "deeplink" = '/viewings' WHERE "deeplink" LIKE '/viewings/%';
