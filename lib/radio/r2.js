import { AwsClient } from 'aws4fetch';
import { readFile } from 'fs/promises';

// R2 speaks the S3 API. Credentials come from .env.local on the VPS.
let client;
function r2() {
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT || !R2_BUCKET) {
    throw new Error('R2 is not configured (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET).');
  }
  client ??= new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
  return { client, base: `${R2_ENDPOINT.replace(/\/+$/, '')}/${R2_BUCKET}` };
}

const objectUrl = (base, key) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;

export function r2Configured() {
  try {
    r2();
    return true;
  } catch {
    return false;
  }
}

/** Size in bytes when the object exists, otherwise null. */
export async function headObject(key) {
  const { client, base } = r2();
  const res = await client.fetch(objectUrl(base, key), { method: 'HEAD' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD ${key} failed: ${res.status}`);
  return Number(res.headers.get('content-length')) || 0;
}

/** Uploads a local file byte for byte. */
export async function putFile(key, filePath, contentType) {
  const { client, base } = r2();
  const body = await readFile(filePath);
  const res = await client.fetch(objectUrl(base, key), {
    method: 'PUT',
    body,
    headers: { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' },
  });
  if (!res.ok) throw new Error(`R2 upload of ${key} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return body.length;
}

/** An object's text, or null when it does not exist. */
export async function getText(key) {
  const { client, base } = r2();
  const res = await client.fetch(objectUrl(base, key));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 GET ${key} failed: ${res.status}`);
  return res.text();
}

export async function putJson(key, value) {
  const { client, base } = r2();
  const res = await client.fetch(objectUrl(base, key), {
    method: 'PUT',
    body: JSON.stringify(value, null, 2),
    headers: { 'content-type': 'application/json' },
  });
  if (!res.ok) throw new Error(`R2 upload of ${key} failed: ${res.status}`);
}
