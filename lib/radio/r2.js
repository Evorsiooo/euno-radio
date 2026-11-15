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

// aws4fetch hands fetch a streamed body, which goes out chunked; R2 refuses a
// PUT without Content-Length (411). Sign first, then send the bytes directly.
async function put(key, body, contentType, extraHeaders = {}) {
  const { client, base } = r2();
  const signed = await client.sign(objectUrl(base, key), {
    method: 'PUT',
    body,
    headers: { 'content-type': contentType, ...extraHeaders },
  });
  return fetch(signed.url, { method: 'PUT', headers: signed.headers, body });
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
  const body = await readFile(filePath);
  const res = await put(key, body, contentType, { 'cache-control': 'public, max-age=31536000, immutable' });
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
  const res = await put(key, Buffer.from(JSON.stringify(value, null, 2)), 'application/json');
  if (!res.ok) throw new Error(`R2 upload of ${key} failed: ${res.status}`);
}
