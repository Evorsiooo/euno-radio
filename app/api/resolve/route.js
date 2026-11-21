import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { resolveAudio } from '@/lib/radio/bitchord/resolveAudio';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * GET /api/resolve?v=<videoId>: what BitChord's resolveAudio picks for a video,
 * without downloading anything (for checking the matcher from the VPS).
 */
export async function GET(request) {
  if (!isAuthorized(request)) return new NextResponse(null, { status: 404 });
  const v = new URL(request.url).searchParams.get('v') || '';
  if (!/^[\w-]{11}$/.test(v)) return NextResponse.json({ error: 'Pass ?v=<11-character video id>' }, { status: 400, headers: noStore });
  return NextResponse.json(await resolveAudio(v), { headers: noStore });
}
