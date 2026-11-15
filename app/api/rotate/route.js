import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { isAuthorized } from '@/lib/auth';

const execFilePromise = promisify(execFile);
const ROTATE_SCRIPT = process.env.ROTATE_SCRIPT_PATH || '/usr/local/bin/rotate_radio_pass.sh';

export const dynamic = 'force-dynamic';

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
