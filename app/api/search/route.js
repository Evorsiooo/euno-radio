import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { searchSongs } from '@/lib/radio/bitchord/innertube';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 300;
const LIMIT = 20;

// Recent answers, so typing back and forth (or two people searching the same thing) asks YouTube once.
const cache = (globalThis.__eunoRadioSearchCache ??= new Map());

const toSeconds = (text) => {
  if (!text) return null;
  const parts = text.split(':').map(Number);
  return parts.some(Number.isNaN) ? null : parts.reduce((total, n) => total * 60 + n, 0);
};

/**
 * GET /api/search?q=<words>: the songs YouTube Music's Songs search finds (BitChord's search(query, SONGS),
 * anonymous, never music videos). Read-only: nothing is downloaded or stored. The site turns a pick into
 * a normal /api/download of https://music.youtube.com/watch?v=<videoId>.
 */
export async function GET(request) {
  if (!isAuthorized(request)) return new NextResponse(null, { status: 404 });
  const q = (new URL(request.url).searchParams.get('q') || '').trim().replace(/\s+/g, ' ');
  if (q.length < 2 || q.length > 200) return NextResponse.json({ error: 'Type 2 to 200 characters.' }, { status: 400, headers: noStore });

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json({ songs: hit.songs, cached: true }, { headers: noStore });

  try {
    const songs = (await searchSongs(q)).slice(0, LIMIT).map((s) => ({
      videoId: s.videoId,
      title: s.title,
      artist: s.artist,
      album: s.albumName || null,
      durationSec: toSeconds(s.durationText),
      thumbnail: s.thumbnailUrl || null,
      explicit: !!s.isExplicit,
      url: `https://music.youtube.com/watch?v=${s.videoId}`,
    }));
    cache.delete(key);
    cache.set(key, { at: Date.now(), songs });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return NextResponse.json({ songs }, { headers: noStore });
  } catch (err) {
    return NextResponse.json({ error: `YouTube Music search failed: ${err?.message || 'request failed'}` }, { status: 502, headers: noStore });
  }
}
