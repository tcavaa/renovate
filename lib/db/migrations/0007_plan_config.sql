-- What each plan includes, admin's to set (docs/subscriptions.md): its features, its projects and its
-- free renders a month, as one JSON value read through normalizePlanConfig; NULL is the defaults.
ALTER TABLE "platform_settings" ADD COLUMN "plan_config" jsonb;