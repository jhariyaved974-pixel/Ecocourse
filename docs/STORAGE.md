# Storage

Created by migration `20261014120700_storage_and_lockdown.sql`.

| Bucket | Access | Limits | Contents |
| --- | --- | --- | --- |
| `catalog-media` | Public read; catalogue staff (owner/admin/editor) can upload, update and delete under `products/`, `content/`, `brand/`, `models/`, `library/` | 50 MB; images, MP4/WebM video, GLB models; extension allowlist | Product photos, videos, 3D models, homepage and brand imagery |
| `payment-proofs` | **Private.** No public URLs. Owners/admins can read via signed URLs. No client upload/delete policies — the server stores files after validation | 5 MB; JPEG, PNG, WebP, PDF | UPI payment screenshots/receipts |

## Uploads from the admin media library

1. The server validates the target folder, declared type and size, and issues a signed upload URL
   for a random object path (`<folder>/<yyyy>/<mm>/<uuid>.<ext>`).
2. The browser uploads directly to Storage with progress feedback.
3. The server downloads the object, checks its real type from the file's first bytes, reads
   image dimensions, computes a SHA-256 (duplicates are reused) and only then records it in
   `media_assets`. Mismatched or unsupported files are deleted.

Assets referenced by products, collections, content or settings cannot be deleted until they are
unused.

## Bundled static assets

`public/images/**` and `public/models/**` contain the generated sample imagery and GLB models.
They are referenced from the database as `external_url` paths (e.g. `/images/products/...`), so
you can replace them with uploaded media without code changes.

## Retention

Payment proofs are evidence for accounting and disputes; keep them for as long as your tax
records require (commonly 8 years in India) and delete them afterwards with a scheduled job or a
manual cleanup of `payment-proofs/orders/<order-id>/` for old orders.
