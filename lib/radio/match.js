import { fetchSignal, ytdlpJson } from './tools';

// Finds a Spotify track on YouTube Music, the way spotDL does (YouTube Music's
// own search, songs first), without needing Spotify's API. A match is accepted
// only when title, artist and length all agree; anything else goes to review.

const YTM_CLIENT_VERSION = process.env.YTM_CLIENT_VERSION || '1.20251110.01.00';
const SONGS = 'EgWKAQIIAWoMEA4QChADEAQQCRAF';
const VIDEOS = 'EgWKAQIQAWoMEA4QChADEAQQCRAF';

// Versions of a song we never pick unless Spotify's own title says so.
const UNWANTED = [
  'live', 'remix', 'sped up', 'speed up', 'slowed', 'reverb', 'cover', 'karaoke', 'instrumental',
  'acoustic', 'nightcore', '8d', 'extended', 'mashup', 'bass boosted', 'reaction', 'tutorial', 'chipmunk',
  'parody', 'piano', '8 bit', 'lofi', 'lo fi', 'loop', '1 hour', 'clean version',
];

const NOISE = [
  'official', 'video', 'audio', 'music', 'lyric', 'lyrics', 'visualizer', 'visualiser', 'hd', 'hq', '4k', 'mv',
  'ft', 'feat', 'featuring', 'with', 'and', 'x', 'the', 'remastered', 'remaster', 'version', 'explicit', 'topic',
];

export function norm(s) {
  return (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9Ѐ-ӿ぀-ヿ一-鿿가-힯 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The song name without "(feat. X)", "- 2011 Remaster" and similar. */
function coreTitle(title) {
  return norm(
    (title || '')
      .replace(/[([](?:feat|ft|with)\.?[^)\]]*[)\]]/gi, ' ')
      .replace(/\s+-\s+.*(?:remaster|version|edit|mono|stereo|mix).*$/i, ' ')
      .replace(/\s+-\s+(?:from|featured in|taken from)\b.*$/i, ' ')
      .replace(/[([][^)\]]*(?:remaster|version|edit)[^)\]]*[)\]]/gi, ' '),
  );
}

const tokens = (s) => new Set(s.split(' ').filter(Boolean));

function parseDuration(text) {
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(text || '')) return null;
  return text.split(':').reduce((acc, n) => acc * 60 + Number(n), 0);
}

function* findRenderers(node, key) {
  if (Array.isArray(node)) {
    for (const v of node) yield* findRenderers(v, key);
  } else if (node && typeof node === 'object') {
    if (node[key]) yield node[key];
    for (const v of Object.values(node)) yield* findRenderers(v, key);
  }
}

async function searchYtm(query, params) {
  const res = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://music.youtube.com',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB_REMIX', clientVersion: YTM_CLIENT_VERSION, hl: 'en', gl: 'US' } },
      query,
      params,
    }),
    signal: fetchSignal(30_000),
  });
  if (!res.ok) throw new Error(`YouTube Music search returned ${res.status}`);
  const data = await res.json();

  const out = [];
  for (const r of findRenderers(data, 'musicResponsiveListItemRenderer')) {
    const videoId = r.playlistItemData?.videoId;
    if (!videoId) continue;
    const cols = (r.flexColumns || []).map((c) => c.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []);
    const title = cols[0]?.map((x) => x.text).join('') || '';
    const meta = cols[1] || [];
    const artists = meta
      .filter((x) => x.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_ARTIST')
      .map((x) => x.text);
    const album = meta.find((x) => x.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_ALBUM')?.text || null;
    const durationSec = meta.map((x) => parseDuration(x.text)).filter((d) => d != null).pop() ?? null;
    const [musicVideoType] = findRenderers(r, 'musicVideoType');
    out.push({
      videoId,
      url: `https://music.youtube.com/watch?v=${videoId}`,
      title,
      artists: artists.length ? artists : meta.filter((x) => x.text.trim() && x.text !== ' • ').slice(1, 2).map((x) => x.text),
      album,
      durationSec,
      kind: musicVideoType === 'MUSIC_VIDEO_TYPE_ATV' ? 'song' : musicVideoType === 'MUSIC_VIDEO_TYPE_OMV' ? 'official video' : 'video',
    });
  }
  return out.slice(0, 5);
}

async function searchYoutube(query) {
  const data = await ytdlpJson(['--flat-playlist', '-J', `ytsearch5:${query}`], { timeoutMs: 60_000 });
  return (data.entries || []).map((e) => ({
    videoId: e.id,
    url: `https://www.youtube.com/watch?v=${e.id}`,
    title: e.title || '',
    artists: [(e.channel || e.uploader || '').replace(/ - Topic$/, '')].filter(Boolean),
    album: null,
    durationSec: e.duration ?? null,
    kind: 'video',
  }));
}

export function scoreCandidate(track, c) {
  const wanted = coreTitle(track.title);
  const wantedTokens = tokens(wanted);
  const candTitle = norm(c.title);
  const candTokens = tokens(candTitle);
  const covered = [...wantedTokens].filter((t) => candTokens.has(t)).length;
  const titleCoverage = wantedTokens.size ? covered / wantedTokens.size : 0;

  const haystack = norm([c.title, ...c.artists].join(' '));
  const artistMatch = track.artists.some((a) => {
    const n = norm(a);
    return n && haystack.includes(n);
  });

  // Words a YouTube upload adds that say nothing about which recording it is.
  const known = new Set([...tokens(norm([track.title, ...track.artists].join(' '))), ...NOISE]);
  const extraWords = [...candTokens].filter((t) => !known.has(t)).length;

  const spotifyTitle = norm(track.title);
  const unwanted = UNWANTED.filter((w) => candTitle.includes(w) && !spotifyTitle.includes(w));

  const durationDiff =
    track.durationMs && c.durationSec != null ? Math.abs(track.durationMs / 1000 - c.durationSec) : null;

  const maxDiff = c.kind === 'song' ? 3 : 5;
  const confident =
    titleCoverage >= 0.8 &&
    artistMatch &&
    unwanted.length === 0 &&
    durationDiff != null &&
    durationDiff <= maxDiff &&
    (c.kind === 'song' || extraWords <= 3);

  const score =
    titleCoverage * 50 +
    (artistMatch ? 30 : 0) +
    (c.kind === 'song' ? 10 : 0) -
    Math.min(durationDiff ?? 30, 30) -
    unwanted.length * 40;

  return { ...c, score: Math.round(score), confident, durationDiff, unwanted };
}

/**
 * { match, candidates }: match is the chosen candidate or null (needs review).
 * candidates are the best few, for the review list.
 */
export async function findOnYoutube(track) {
  const query = `${track.artists.join(' ')} ${track.title}`;
  const seen = new Set();
  const scored = [];
  const add = (list) => {
    for (const c of list) {
      if (seen.has(c.videoId)) continue;
      seen.add(c.videoId);
      scored.push(scoreCandidate(track, c));
    }
  };
  const best = () => scored.filter((c) => c.confident).sort((a, b) => b.score - a.score)[0] || null;

  const errors = [];
  for (const search of [() => searchYtm(query, SONGS), () => searchYtm(query, VIDEOS), () => searchYoutube(query)]) {
    try {
      add(await search());
    } catch (e) {
      if (e.name === 'CancelledError' || e.name === 'AbortError') throw e;
      errors.push(e.message);
    }
    if (best()) break;
  }

  const candidates = [...scored].sort((a, b) => b.score - a.score).slice(0, 3);
  if (!scored.length && errors.length) throw new Error(errors.join(' | '));
  return { match: best(), candidates };
}
