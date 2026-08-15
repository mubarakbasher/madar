-- Tenant display preferences: Arabic-Indic numerals and Hijri calendar.
--
-- Display-only. Storage stays Western digits and ISO 8601 UTC
-- (docs/i18n-guide.md §5.1, §5.2) — these flags change rendering, never data,
-- and are never sent to the API as part of a payload value.
--
-- Both default false, matching the documented product defaults: Western digits
-- for every locale, Gregorian calendar.
--
-- Hand-written rather than `prisma migrate dev`-generated on purpose. This
-- schema has long-standing drift from the migration history (earlier
-- migrations named indexes and constraints differently from Prisma's
-- convention), so the generator emits ~120 unrelated index renames and
-- foreign-key drop/re-adds alongside any real change. Those belong in their
-- own reconciliation migration, not bundled into a feature.

ALTER TABLE "tenants"
  ADD COLUMN "use_arabic_indic_digits" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "use_hijri_calendar"      BOOLEAN NOT NULL DEFAULT false;
