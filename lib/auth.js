import { timingSafeEqual } from 'crypto';

// The ftn.euno.cc site calls these endpoints with the shared token. ADMIN_TOKEN
// must be set; there is no unauthenticated fallback.
export function isAuthorized(request) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;

  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;

  const provided = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}
