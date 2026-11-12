// Local test gateway that stands in for Supabase's Kong + Storage API.
//
//   /rest/v1/*     -> PostgREST
//   /auth/v1/*     -> GoTrue
//   /storage/v1/*  -> implemented here against the `storage` schema
//
// Storage operations run inside a transaction that assumes the caller's JWT role
// and claims (exactly like storage-api does), so the storage.objects RLS policies
// written in supabase/migrations are what allow or deny each request.
//
// This is a development/test tool only. It is not used in production.

import http from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { jwtVerify, SignJWT } from 'jose';

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const REST_URL = process.env.REST_URL ?? 'http://127.0.0.1:54330';
const AUTH_URL = process.env.AUTH_URL ?? 'http://127.0.0.1:54331';
const DATA_DIR = process.env.STORAGE_DIR ?? '/tmp/pgstack/storage';
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
const pool = new pg.Pool({
  connectionString: process.env.STORAGE_DB_URL ?? 'postgres://authenticator:postgres@127.0.0.1:54322/postgres',
  max: 20,
});
// Privileged pool for bucket/object metadata lookups (storage-api has the same split).
const adminPool = new pg.Pool({
  connectionString: process.env.STORAGE_ADMIN_DB_URL ?? 'postgres://postgres@127.0.0.1:54322/postgres',
  max: 5,
});

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required');
  process.exit(1);
}

function cors(res, req) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] ??
      'authorization,apikey,content-type,x-client-info,x-upsert,cache-control,range,prefer,accept-profile,content-profile',
  );
  res.setHeader('Access-Control-Expose-Headers', 'content-range,content-length,etag,x-total-count');
}

function proxy(req, res, target, stripPrefix) {
  const url = new URL(req.url.slice(stripPrefix.length) || '/', target);
  const headers = { ...req.headers, host: url.host };
  const upstream = http.request(url, { method: req.method, headers }, (up) => {
    const outHeaders = { ...up.headers };
    delete outHeaders['access-control-allow-origin'];
    res.writeHead(up.statusCode ?? 502, outHeaders);
    up.pipe(res);
  });
  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: `upstream error: ${err.message}` }));
  });
  req.pipe(upstream);
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function storageError(res, status, message, error = 'Error') {
  json(res, status, { statusCode: String(status), error, message });
}

async function claimsFrom(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers.apikey;
  if (!token) return { role: 'anon' };
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

async function readBody(req, limit = 200 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Minimal multipart parser: returns the first part that carries a filename or is unnamed.
function parseMultipart(body, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) return null;
  const boundary = Buffer.from(`--${match[1] ?? match[2]}`);
  let start = body.indexOf(boundary);
  while (start !== -1) {
    const next = body.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    const part = body.subarray(start + boundary.length + 2, next - 2);
    const headerEnd = part.indexOf('\r\n\r\n');
    const rawHeaders = part.subarray(0, headerEnd).toString();
    const content = part.subarray(headerEnd + 4);
    const disposition = /content-disposition:([^\r\n]+)/i.exec(rawHeaders)?.[1] ?? '';
    const type = /content-type:\s*([^\r\n]+)/i.exec(rawHeaders)?.[1]?.trim();
    const name = /name="([^"]*)"/i.exec(disposition)?.[1];
    if (/filename=/i.test(disposition) || name === '') {
      return { content, contentType: type ?? 'application/octet-stream' };
    }
    start = next;
  }
  return null;
}

async function asRole(claims, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const role = ['anon', 'authenticated', 'service_role'].includes(claims.role) ? claims.role : 'anon';
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [String(claims.sub ?? '')]);
    await client.query(`select set_config('request.jwt.claim.role', $1, true)`, [role]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function getBucket(id) {
  const { rows } = await adminPool.query('select * from storage.buckets where id = $1', [id]);
  return rows[0];
}

function filePath(bucket, name) {
  const resolved = path.resolve(DATA_DIR, bucket, name);
  if (!resolved.startsWith(path.resolve(DATA_DIR, bucket) + path.sep)) {
    throw Object.assign(new Error('Invalid key'), { status: 400 });
  }
  return resolved;
}

function mimeAllowed(bucket, mime) {
  if (!bucket.allowed_mime_types || bucket.allowed_mime_types.length === 0) return true;
  return bucket.allowed_mime_types.some((pattern) => {
    if (pattern.endsWith('/*')) return mime.startsWith(pattern.slice(0, -1));
    return pattern === mime;
  });
}

async function handleUpload(req, res, claims, bucketId, name, { upsert }) {
  const bucket = await getBucket(bucketId);
  if (!bucket) return storageError(res, 404, 'Bucket not found', 'Bucket not found');
  let body = await readBody(req);
  let mime = (req.headers['content-type'] ?? 'application/octet-stream').split(';')[0].trim();
  if (mime === 'multipart/form-data') {
    const part = parseMultipart(body, req.headers['content-type']);
    if (!part) return storageError(res, 400, 'No file found in form data');
    body = part.content;
    mime = part.contentType;
  }
  if (bucket.file_size_limit && body.length > Number(bucket.file_size_limit)) {
    return storageError(res, 413, 'The object exceeded the maximum allowed size', 'Payload too large');
  }
  if (!mimeAllowed(bucket, mime)) {
    return storageError(res, 415, `mime type ${mime} is not supported`, 'invalid_mime_type');
  }
  const metadata = {
    size: body.length,
    mimetype: mime,
    eTag: `"${crypto.createHash('md5').update(body).digest('hex')}"`,
    cacheControl: req.headers['cache-control'] ?? 'max-age=3600',
    contentLength: body.length,
  };
  try {
    const row = await asRole(claims, async (client) => {
      const owner = claims.role === 'authenticated' ? claims.sub : null;
      const sql = upsert
        ? `insert into storage.objects (bucket_id, name, owner, owner_id, metadata, version)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (bucket_id, name) do update set metadata = excluded.metadata, version = excluded.version, updated_at = now()
           returning id, name`
        : `insert into storage.objects (bucket_id, name, owner, owner_id, metadata, version)
           values ($1, $2, $3, $4, $5, $6) returning id, name`;
      const { rows } = await client.query(sql, [bucketId, name, owner, owner, metadata, crypto.randomUUID()]);
      return rows[0];
    });
    const target = filePath(bucketId, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    json(res, 200, { Id: row.id, Key: `${bucketId}/${name}`, id: row.id, path: name, fullPath: `${bucketId}/${name}` });
  } catch (err) {
    if (err.code === '23505') return storageError(res, 409, 'The resource already exists', 'Duplicate');
    if (err.code === '42501') {
      return storageError(res, 403, 'new row violates row-level security policy', 'Unauthorized');
    }
    throw err;
  }
}

async function serveFile(req, res, bucketId, name, downloadName) {
  const { rows } = await adminPool.query(
    'select metadata from storage.objects where bucket_id = $1 and name = $2',
    [bucketId, name],
  );
  if (!rows[0]) return storageError(res, 404, 'Object not found', 'not_found');
  const meta = rows[0].metadata ?? {};
  const target = filePath(bucketId, name);
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) return storageError(res, 404, 'Object not found', 'not_found');
  const headers = {
    'content-type': meta.mimetype ?? 'application/octet-stream',
    'cache-control': meta.cacheControl ?? 'max-age=3600',
    'accept-ranges': 'bytes',
    etag: meta.eTag ?? '',
  };
  if (downloadName !== undefined) {
    headers['content-disposition'] = `attachment; filename="${downloadName || path.basename(name)}"`;
  }
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return createReadStream(target, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'content-length': stat.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(target).pipe(res);
}

async function canSelect(claims, bucketId, name) {
  return asRole(claims, async (client) => {
    const { rows } = await client.query(
      'select 1 from storage.objects where bucket_id = $1 and name = $2',
      [bucketId, name],
    );
    return rows.length > 0;
  });
}

async function signToken(payload, expiresIn) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(JWT_SECRET);
}

async function handleStorage(req, res) {
  const url = new URL(req.url, 'http://local');
  const route = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ''));
  const claims = await claimsFrom(req);

  // Signed download: GET /object/sign/:bucket/:path?token=
  let m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(route);
  if (m && (req.method === 'GET' || req.method === 'HEAD')) {
    try {
      const { payload } = await jwtVerify(url.searchParams.get('token') ?? '', JWT_SECRET);
      if (payload.url !== `${m[1]}/${m[2]}`) return storageError(res, 400, 'Invalid signature');
    } catch {
      return storageError(res, 400, 'Invalid or expired signature', 'InvalidJWT');
    }
    const download = url.searchParams.has('download') ? url.searchParams.get('download') : undefined;
    return serveFile(req, res, m[1], m[2], download);
  }

  if (!claims) return storageError(res, 400, 'Invalid JWT', 'Unauthorized');

  // Create signed download URL: POST /object/sign/:bucket/:path
  if (m && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (!(await canSelect(claims, m[1], m[2]))) return storageError(res, 404, 'Object not found', 'not_found');
    const token = await signToken({ url: `${m[1]}/${m[2]}` }, Number(body.expiresIn ?? 60));
    return json(res, 200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=${token}` });
  }

  // Create signed upload URL: POST /object/upload/sign/:bucket/:path
  m = /^\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(route);
  if (m && req.method === 'POST') {
    // Mirror storage-api: the signer must be allowed to insert at that path.
    const allowed = await asRole(claims, async (client) => {
      await client.query('savepoint probe');
      try {
        await client.query(
          `insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ($1, $2, $3::uuid, $3::text, '{}')`,
          [m[1], m[2], claims.role === 'authenticated' ? claims.sub : null],
        );
        await client.query('rollback to savepoint probe');
        return true;
      } catch (err) {
        await client.query('rollback to savepoint probe');
        if (err.code === '42501') return false;
        if (err.code === '23505') return true;
        throw err;
      }
    });
    if (!allowed) return storageError(res, 403, 'new row violates row-level security policy', 'Unauthorized');
    const upsert = req.headers['x-upsert'] === 'true';
    const token = await signToken({ url: `${m[1]}/${m[2]}`, owner: claims.sub ?? null, upsert }, 7200);
    return json(res, 200, { url: `/object/upload/sign/${m[1]}/${m[2]}?token=${token}`, token });
  }
  // Upload to signed URL: PUT /object/upload/sign/:bucket/:path?token=
  if (m && req.method === 'PUT') {
    let payload;
    try {
      ({ payload } = await jwtVerify(url.searchParams.get('token') ?? '', JWT_SECRET));
    } catch {
      return storageError(res, 400, 'Invalid or expired signature', 'InvalidJWT');
    }
    if (payload.url !== `${m[1]}/${m[2]}`) return storageError(res, 400, 'Invalid signature');
    return handleUpload(req, res, { role: 'service_role', sub: payload.owner }, m[1], m[2], {
      upsert: Boolean(payload.upsert),
    });
  }

  // Public download: GET /object/public/:bucket/:path
  m = /^\/object\/public\/([^/]+)\/(.+)$/.exec(route);
  if (m && (req.method === 'GET' || req.method === 'HEAD')) {
    const bucket = await getBucket(m[1]);
    if (!bucket?.public) return storageError(res, 400, 'Bucket not found', 'not_found');
    return serveFile(req, res, m[1], m[2]);
  }

  // Object info: GET /object/info/:bucket/:path
  m = /^\/object\/info\/(?:authenticated\/)?([^/]+)\/(.+)$/.exec(route);
  if (m && (req.method === 'GET' || req.method === 'HEAD')) {
    const row = await asRole(claims, async (client) => {
      const { rows } = await client.query(
        'select id, name, metadata, created_at, updated_at from storage.objects where bucket_id = $1 and name = $2',
        [m[1], m[2]],
      );
      return rows[0];
    });
    if (!row) return storageError(res, 404, 'Object not found', 'not_found');
    return json(res, 200, {
      id: row.id,
      name: row.name,
      size: row.metadata?.size,
      content_type: row.metadata?.mimetype,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  // List: POST /object/list/:bucket
  m = /^\/object\/list\/([^/]+)$/.exec(route);
  if (m && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const prefix = body.prefix ? `${String(body.prefix).replace(/\/$/, '')}/` : '';
    const rows = await asRole(claims, async (client) => {
      const { rows } = await client.query(
        `select id, name, metadata, created_at, updated_at from storage.objects
         where bucket_id = $1 and name like $2 order by name limit $3 offset $4`,
        [m[1], `${prefix}%`, Number(body.limit ?? 100), Number(body.offset ?? 0)],
      );
      return rows;
    });
    return json(
      res,
      200,
      rows.map((r) => ({ ...r, name: r.name.slice(prefix.length) })),
    );
  }

  // Remove: DELETE /object/:bucket  { prefixes: [] }
  m = /^\/object\/([^/]+)$/.exec(route);
  if (m && req.method === 'DELETE') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const prefixes = Array.isArray(body.prefixes) ? body.prefixes : [];
    const deleted = await asRole(claims, async (client) => {
      const { rows } = await client.query(
        'delete from storage.objects where bucket_id = $1 and name = any($2) returning id, name, metadata',
        [m[1], prefixes],
      );
      return rows;
    });
    for (const row of deleted) await fs.rm(filePath(m[1], row.name), { force: true });
    return json(res, 200, deleted);
  }

  // Upload / update / authenticated download: /object/:bucket/:path (and /object/authenticated/...)
  m = /^\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/.exec(route);
  if (m) {
    if (req.method === 'POST') {
      return handleUpload(req, res, claims, m[1], m[2], { upsert: req.headers['x-upsert'] === 'true' });
    }
    if (req.method === 'PUT') return handleUpload(req, res, claims, m[1], m[2], { upsert: true });
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!(await canSelect(claims, m[1], m[2]))) return storageError(res, 404, 'Object not found', 'not_found');
      return serveFile(req, res, m[1], m[2]);
    }
  }

  if (route === '/bucket' && req.method === 'GET') {
    const { rows } = await adminPool.query('select * from storage.buckets order by id');
    return json(res, 200, rows);
  }

  storageError(res, 404, `No route for ${req.method} ${route}`, 'not_found');
}

const server = http.createServer(async (req, res) => {
  cors(res, req);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  try {
    if (req.url.startsWith('/rest/v1')) return proxy(req, res, REST_URL, '/rest/v1');
    if (req.url.startsWith('/auth/v1')) return proxy(req, res, AUTH_URL, '/auth/v1');
    if (req.url.startsWith('/storage/v1')) return await handleStorage(req, res);
    json(res, 404, { message: 'not found' });
  } catch (err) {
    console.error('[gateway]', err);
    if (!res.headersSent) storageError(res, err.status ?? 500, err.message ?? 'Internal error');
    else res.end();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[gateway] listening on http://127.0.0.1:${PORT}`);
});
