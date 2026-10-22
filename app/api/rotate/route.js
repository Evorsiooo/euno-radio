import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { timingSafeEqual } from 'crypto';

const execFilePromise = promisify(execFile);
const ROTATE_SCRIPT = process.env.ROTATE_SCRIPT_PATH || '/usr/local/bin/rotate_radio_pass.sh';

export const dynamic = 'force-dynamic';

// The ftn.euno.cc site calls this with the shared token. ADMIN_TOKEN must be set;
// there is no unauthenticated fallback.
function isAuthorized(request) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;

  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;

  const provided = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}

// Anything but an authorised POST looks like a missing page.
export function GET() {
  return new NextResponse(null, { status: 404 });
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const { stdout } = await execFilePromise(ROTATE_SCRIPT, { timeout: 15000 });
    const newPassword = stdout.trim();
    if (!newPassword) {
      throw new Error('Script returned an empty password.');
    }
    return NextResponse.json({ success: true, newPassword }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Password rotation failed:', error.message);
    return NextResponse.json({ error: 'Rotation failed' }, { status: 500 });
  }
}
