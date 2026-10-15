-- -----------------------------------------------------------------------------
-- Fix media_assets.storage_path validation.
--
-- The original check used the regex bound {3,300}, but PostgreSQL limits
-- repetition counts to 255 (RE_DUP_MAX), so evaluating it raised "invalid
-- regular expression: invalid repetition count(s)" and every insert of a
-- storage-backed asset (anything uploaded through the media library) failed.
-- Same rule as intended: 3–300 characters, safe characters only, no "..".
-- -----------------------------------------------------------------------------

alter table public.media_assets drop constraint if exists media_assets_storage_path_check;

alter table public.media_assets add constraint media_assets_storage_path_check check (
  storage_path is null
  or (
    char_length(storage_path) between 3 and 300
    and storage_path !~ '\.\.'
    and storage_path ~ '^[A-Za-z0-9/_.-]+$'
  )
);
