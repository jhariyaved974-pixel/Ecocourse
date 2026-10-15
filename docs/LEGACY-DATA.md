# Data from the earlier store

The Supabase project used by the earlier single-page version of the store has its own tables
(`public.products` with a text id and JSON `colors`/`images`, `site_settings`, `admins`,
`deals`, `subscribers`, …). The new schema needs those table names, so the migrations handle
them **without deleting anything**:

1. `20261014120000_archive_legacy_schema.sql` — only if the old `public.products.cat` column is
   present, moves the old tables and their helper functions into a `legacy` schema. The schema
   is not exposed through the Data API (no anon/authenticated access). On a fresh project the
   migration does nothing.
2. `20261014120900_import_legacy_catalog.sql` — imports what can be reused:
   - categories (the old "slides" category maps to "sandals"),
   - products **as drafts** (they had no real photos or stock): colours, UK-size variants with
     stock 0, specifications,
   - coupons (rupee amounts converted to paise),
   - newsletter subscribers,
   - shipping fees/thresholds from the old settings.
   It is idempotent and leaves the `legacy` rows untouched.

Not imported on purpose: the old `admins` table (staff access must be granted again through the
secure bootstrap — no credentials or roles are carried over), `deals`, the old activity log and
settings that do not map to the new model. They stay readable in the `legacy` schema by a
database administrator.

## Important before applying to that project

- **The earlier website stops working** once its tables move to `legacy`. Apply the migrations
  only when you are ready to switch to this application (or point the old site at a copy).
- Take a backup first (Database → Backups, or `pg_dump`).
- After import, review the drafts in Admin → Products: add photos, set stock, then publish.
- When you no longer need the archive, a database administrator can export and drop the
  `legacy` schema. This is never done automatically.

The import was tested against a faithful reproduction of the old schema
(`supabase/tests/legacy_fixture.sql`).
