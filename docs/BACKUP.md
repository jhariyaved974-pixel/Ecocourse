# Backups and recovery

## Database

- **Supabase daily backups** are included on paid plans (Database → Backups). Enable
  **Point-in-Time Recovery** for the production project if you can — it lets you restore to any
  second within the retention window.
- **Your own copy.** Schedule an off-site logical dump (from a trusted machine or CI with the
  database connection string kept as a secret):

  ```bash
  pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --file=auren-$(date +%F).dump
  ```

  Store dumps encrypted (they contain customer personal data) and delete old ones on a schedule.
- **Restore drill** (do this before launch and every quarter): restore the latest dump into a
  new Supabase project or a local Postgres (`pg_restore --no-owner -d <target> file.dump`), run
  `npm run test:db` against it if it is a scratch database, and open the admin panel to check
  recent orders.

## Storage

Supabase backups do not include Storage objects. Periodically copy both buckets with the
Supabase CLI or S3-compatible tooling (Storage → S3 connection), e.g.:

```bash
supabase storage cp -r ss:///catalog-media ./backup/catalog-media --experimental
supabase storage cp -r ss:///payment-proofs ./backup/payment-proofs --experimental
```

`payment-proofs` contains sensitive financial screenshots — keep its backups encrypted and
access-restricted.

## Application

The application is stateless: redeploy from Git (Vercel keeps previous deployments for instant
rollback). Environment variables live in Vercel; keep a copy of the secret values in your
password manager — `ORDER_ACCESS_SECRET` in particular, because rotating it invalidates guest
order links already sent by email.

## Data exports

- Orders, inventory and products can be exported as CSV from the admin panel.
- Customer data-export requests are handled from Admin → Customer requests.
