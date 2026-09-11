-- ─── Scan scope starts empty ─────────────────────────────────────────────────
--
-- monitor_downloads defaulted to TRUE, so every new account began life watching
-- a Downloads folder its owner had never chosen. Combined with the one-time
-- legacy migration on the client — which re-ran whenever custom_folders was
-- empty — removing that folder put it straight back, which is what users were
-- actually reporting.
--
-- The product rule is that scan scope contains exactly what someone added and
-- nothing else. A default of TRUE contradicts that before the app has even
-- opened.
--
-- ALTER COLUMN rather than the ADD COLUMN ... DEFAULT in 004: adding a column
-- that already exists is a no-op, so the old default survives every deploy
-- until it is changed explicitly.

ALTER TABLE user_preferences
    ALTER COLUMN monitor_downloads SET DEFAULT FALSE;

-- Existing rows keep whatever they have. Clearing them here would be wrong for
-- anyone still relying on the legacy toggles; the client migration reads the
-- flags once, writes the real paths into custom_folders, and then turns the
-- flags off itself — so they are retired per user, on the one launch where it
-- can still be done safely.
