import { createHash } from 'crypto';
import { existsSync, readFileSync, statSync } from 'fs';
import { fetchSignal } from '../tools';

// The YouTube Music calls BitChord's resolveAudio makes, copied from BitChord
// (Evorsiooo/BitChord at acf219a7):
//   shared/src/jvmSharedMain/.../data/innertube/Innertube.kt       postMusic, postMusicAnonymous,
//                                                                  search, next, the shell read, SAPISIDHASH
//   shared/src/jvmSharedMain/.../data/innertube/InnertubeParser.kt parseSearchPage, parseResponsiveListItem,
//                                                                  parseCardShelfSong, panelSong,
//                                                                  parseVersionPair and their helpers
// A Song here is BitChord's Song data class, with the fields these read:
//   { videoId, title, artist, thumbnailUrl, durationText, albumName, isVideo, isExplicit }
// The signed-in session is the throwaway account whose cookies yt-dlp already
// uses (YTDLP_COOKIES); without it every request is anonymous, as BitChord's
// are when signed out (YouTube then pairs nothing, see parseVersionPair).

const MUSIC_ORIGIN = 'https://music.youtube.com';
const MUSIC_BASE = `${MUSIC_ORIGIN}/youtubei/v1`;
/** Innertube.WEB_REMIX_VERSION: used until the shell's live version is read. */
const WEB_REMIX_VERSION = process.env.YTM_CLIENT_VERSION || '1.20250101.01.00';
const WEB_REMIX_CLIENT_ID = '67';
const WEB_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const LANGUAGE = 'en';
const ACCEPT_LANGUAGE = 'en-US,en;q=0.9';
const TIMEOUT_MS = 30_000;

/** Models.kt SearchFilter.SONGS. */
export const SEARCH_SONGS = 'EgWKAQIIAWoKEAkQChAFEAMQBA==';

// ── Session (cookies.txt → Cookie header, like the phone's cookie string) ───

const session = (globalThis.__eunoRadioYtm ??= { cookie: undefined, cookieMtime: 0, scope: null, scopeAt: 0, visitorData: null });

/** The youtube.com cookies of the Netscape cookies file yt-dlp uses, as one header. */
function cookieHeader() {
  const file = process.env.YTDLP_COOKIES;
  if (!file || !existsSync(file)) return null;
  try {
    const jar = new Map();
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      // "#HttpOnly_" lines are cookies too; other "#" lines are comments.
      const row = line.startsWith('#HttpOnly_') ? line.slice('#HttpOnly_'.length) : line;
      if (!row.trim() || row.startsWith('#')) continue;
      const [domain, , , , expires, name, value] = row.split('\t');
      if (!name || value === undefined || !/(^|\.)youtube\.com$/.test(domain.replace(/^\./, ''))) continue;
      if (Number(expires) > 0 && Number(expires) * 1000 < Date.now()) continue;
      jar.set(name, value.trim());
    }
    return jar.size ? [...jar].map(([k, v]) => `${k}=${v}`).join('; ') : null;
  } catch {
    return null;
  }
}

/** Innertube.sapisidFrom: SAPISID, else the __Secure- forms. */
function sapisidFrom(header) {
  const jar = new Map(
    header.split(';').map((entry) => {
      const at = entry.indexOf('=');
      return at < 0 ? [entry.trim(), ''] : [entry.slice(0, at).trim(), entry.slice(at + 1).trim()];
    }),
  );
  for (const name of ['SAPISID', '__Secure-3PAPISID', '__Secure-1PAPISID']) if (jar.get(name)) return jar.get(name);
  return null;
}

/** Innertube.sapisidHash. */
function sapisidHash(sapisid, origin = MUSIC_ORIGIN) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHash('sha1').update(`${timestamp} ${sapisid} ${origin}`).digest('hex');
  return `SAPISIDHASH ${timestamp}_${digest}`;
}

/** DataSyncId.kt normalizeDataSyncId. */
function normalizeDataSyncId(raw) {
  if (!raw || !raw.trim()) return null;
  if (!raw.includes('||')) return raw;
  const after = raw.slice(raw.indexOf('||') + 2);
  if (after.trim()) return after;
  const before = raw.slice(0, raw.indexOf('||'));
  return before.trim() ? before : null;
}

const CONFIG_LOGGED_IN = /"LOGGED_IN"\s*:\s*(true|false)/;
const CONFIG_DATASYNC_ID = /"DATASYNC_ID"\s*:\s*"([^"]+)"/;
const CONFIG_PAGE_ID = /"DELEGATED_SESSION_ID"\s*:\s*"([^"]+)"/;
const CONFIG_SESSION_INDEX = /"SESSION_INDEX"\s*:\s*"?(\d+)/;
const CONFIG_VISITOR_DATA = /"VISITOR_DATA"\s*:\s*"([^"]+)"/;
const CONFIG_CLIENT_VERSION = /"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/;

/** Innertube.fetchSessionScope: the music.youtube.com shell's ytcfg, read with the session. */
async function fetchSessionScope(cookie) {
  const headers = { 'User-Agent': WEB_USER_AGENT, 'Accept-Language': ACCEPT_LANGUAGE, Cookie: cookie };
  const sapisid = sapisidFrom(cookie);
  if (sapisid) headers.Authorization = sapisidHash(sapisid);
  const res = await fetch(`${MUSIC_ORIGIN}/`, { headers, signal: fetchSignal(TIMEOUT_MS) });
  const html = await res.text();
  const signedIn = CONFIG_LOGGED_IN.exec(html)?.[1] === 'true';
  const clientVersion = CONFIG_CLIENT_VERSION.exec(html)?.[1] ?? null;
  if (!signedIn) {
    console.warn('music.youtube.com served a signed-out shell; not scoping requests (cookies expired?)');
    return clientVersion ? { dataSyncId: null, pageId: null, authUser: '0', clientVersion, signedIn: false } : null;
  }
  const pageId = CONFIG_PAGE_ID.exec(html)?.[1]?.trim() || null;
  const dataSyncId = pageId ?? normalizeDataSyncId(CONFIG_DATASYNC_ID.exec(html)?.[1]);
  const authUser = CONFIG_SESSION_INDEX.exec(html)?.[1]?.trim() || null;
  const visitor = CONFIG_VISITOR_DATA.exec(html)?.[1]?.trim();
  if (visitor) session.visitorData = visitor;
  return { dataSyncId, pageId, authUser: authUser ?? '0', clientVersion, signedIn: true };
}

/** The cookie (re-read when the file changes) and its scope (re-read hourly). */
async function ensureSession() {
  const file = process.env.YTDLP_COOKIES;
  const mtime = file && existsSync(file) ? statSync(file).mtimeMs : 0;
  if (session.cookie === undefined || mtime !== session.cookieMtime) {
    session.cookie = cookieHeader();
    session.cookieMtime = mtime;
    session.scope = null;
  }
  if (session.cookie && (!session.scope || Date.now() - session.scopeAt > 3_600_000)) {
    try {
      session.scope = await fetchSessionScope(session.cookie);
    } catch (e) {
      if (e.name === 'CancelledError' || e.name === 'AbortError') throw e;
      session.scope = null;
    }
    session.scopeAt = Date.now();
  }
  return session;
}

/** Whether `next` is asked as a signed-in user (YouTube pairs versions only then). */
export async function isSignedIn() {
  const s = await ensureSession();
  return !!s.cookie && !!s.scope?.signedIn;
}

async function post(endpoint, body, { anonymous }) {
  const s = await ensureSession();
  const clientVersion = s.scope?.clientVersion ?? WEB_REMIX_VERSION;
  const headers = {
    'Content-Type': 'application/json',
    'Accept-Language': ACCEPT_LANGUAGE,
    'User-Agent': WEB_USER_AGENT,
    'X-Origin': MUSIC_ORIGIN,
    Origin: MUSIC_ORIGIN,
    Referer: `${MUSIC_ORIGIN}/`,
    'X-YouTube-Client-Name': WEB_REMIX_CLIENT_ID,
    'X-YouTube-Client-Version': clientVersion,
  };
  if (s.visitorData) headers['X-Goog-Visitor-Id'] = s.visitorData;
  const user = { lockedSafetyMode: false };
  if (!anonymous && s.cookie) {
    headers.Cookie = s.cookie;
    headers['X-Goog-AuthUser'] = s.scope?.authUser ?? '0';
    if (s.scope?.pageId) headers['X-Goog-PageId'] = s.scope.pageId;
    const sapisid = sapisidFrom(s.cookie);
    if (sapisid) headers.Authorization = sapisidHash(sapisid);
    if (s.scope?.dataSyncId) user.onBehalfOfUser = s.scope.dataSyncId;
  }
  const client = { clientName: 'WEB_REMIX', clientVersion, hl: LANGUAGE };
  if (s.visitorData) client.visitorData = s.visitorData;
  const res = await fetch(`${MUSIC_BASE}/${endpoint}?prettyPrint=false&hl=${LANGUAGE}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ context: { client, user, request: { useSsl: true } }, ...body }),
    signal: fetchSignal(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`YouTube Music ${endpoint} returned ${res.status}`);
  const json = await res.json();
  if (!s.visitorData && json?.responseContext?.visitorData) s.visitorData = json.responseContext.visitorData;
  return json;
}

/** Innertube.search (anonymous, as BitChord's default). */
export const searchRaw = (query, params) => post('search', { query, ...(params ? { params } : {}) }, { anonymous: true });

/** Innertube.next: the watch queue of [videoId], as the phone asks for it. */
export const nextRaw = (videoId) =>
  post('next', { videoId, playlistId: `RDAMVM${videoId}`, isAudioOnly: true }, { anonymous: false });

// ── JSON helpers (InnertubeParser's o/a/s/runs) ─────────────────────────────

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const o = (v, key) => (isObj(v) && isObj(v[key]) ? v[key] : null);
const a = (v, key) => (isObj(v) && Array.isArray(v[key]) ? v[key] : null);
const s = (v, key) => {
  if (!isObj(v)) return null;
  const x = v[key];
  return typeof x === 'string' ? x : typeof x === 'number' || typeof x === 'boolean' ? String(x) : null;
};
const runs = (v) => (a(v, 'runs') ?? []).map((r) => s(r, 'text') ?? '').join('');

/** InnertubeParser.collectRenderers: every [name] object anywhere under [root], in document order. */
export function collectRenderers(root, name) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (isObj(node)) {
      if (isObj(node[name])) out.push(node[name]);
      Object.values(node).forEach(walk);
    }
  };
  walk(root);
  return out;
}

function findString(node, key) {
  if (Array.isArray(node)) {
    for (const v of node) {
      const f = findString(v, key);
      if (f != null) return f;
    }
  } else if (isObj(node)) {
    if (typeof node[key] === 'string') return node[key];
    for (const v of Object.values(node)) {
      const f = findString(v, key);
      if (f != null) return f;
    }
  }
  return null;
}

/** Last thumbnail is the largest. */
const best = (thumbs) => s(thumbs?.at(-1), 'url');

/** Catalogue art is square; a music video's thumbnail is widescreen. */
function isNotSquare(thumbs) {
  const last = thumbs?.at(-1);
  const width = Number(s(last, 'width'));
  const height = Number(s(last, 'height'));
  if (!s(last, 'width') || !s(last, 'height') || !Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return !(ratio >= 0.85 && ratio <= 1.15);
}

/** YouTube nests this badge differently across search, album and queue renderers: true or null. */
function hasExplicitBadge(v) {
  const walk = (x) =>
    typeof x === 'string' ? x === 'MUSIC_EXPLICIT_BADGE' : Array.isArray(x) ? x.some(walk) : isObj(x) ? Object.values(x).some(walk) : false;
  return walk(v) ? true : null;
}

const isPodcastEpisode = (renderer) => findString(renderer, 'musicVideoType') === 'MUSIC_VIDEO_TYPE_PODCAST_EPISODE';

const DURATION = /^\d+:\d{2}$/;
const TALLY = /^[\d.,]+\s*[KMB]?\s+(plays|views|likes|songs|tracks|subscribers|hours?|minutes?|seconds?)\b.*$/i;
const TYPE_WORDS = new Set(['song', 'video', 'album', 'single', 'ep', 'artist', 'playlist', 'podcast', 'episode']);
const VIDEO_WORD = /\bvideos?\b/i;

const pageTypeOf = (run) =>
  s(o(o(o(o(run, 'navigationEndpoint'), 'browseEndpoint'), 'browseEndpointContextSupportedConfigs'), 'browseEndpointContextMusicConfig'), 'pageType') ?? '';

/** InnertubeParser.creditsOf: the first artist and album the runs link to. */
function creditsOf(runList) {
  const credits = { artistId: null, artistName: null, albumId: null, albumName: null };
  for (const run of runList) {
    const browse = o(o(run, 'navigationEndpoint'), 'browseEndpoint');
    const id = s(browse, 'browseId');
    if (!id) continue;
    const pageType = pageTypeOf(run);
    if (!pageType.includes('ARTIST') && !pageType.includes('ALBUM')) continue;
    const name = s(run, 'text') ?? '';
    if (pageType.includes('ARTIST')) {
      if (credits.artistId == null) Object.assign(credits, { artistId: id, artistName: name });
    } else if (credits.albumId == null) Object.assign(credits, { albumId: id, albumName: name });
  }
  return credits;
}

/** InnertubeParser.artistNamesFromRuns: every name in the artist segment. */
function artistNamesFromRuns(runList) {
  const groups = [[]];
  for (const run of runList) {
    if (s(run, 'text')?.trim() === '•') groups.push([]);
    else groups.at(-1).push(run);
  }
  const group = groups.find((g) => g.some((run) => pageTypeOf(run).includes('ARTIST')));
  if (!group) return null;
  const names = group
    .map((run, index) => (index % 2 !== 0 ? null : s(run, 'text')?.trim() || null))
    .filter((n) => n);
  return [...new Set(names)].join(', ') || null;
}

/** InnertubeParser.parseBrowseItem, as far as telling a browse row from a track. */
function isBrowseItem(renderer) {
  const endpoint = o(o(renderer, 'navigationEndpoint'), 'browseEndpoint');
  if (!endpoint || !s(endpoint, 'browseId')) return false;
  const columns = a(renderer, 'flexColumns') ?? [];
  const title = runs(o(o(columns[0], 'musicResponsiveListItemFlexColumnRenderer'), 'text'));
  if (!title.trim()) return false;
  const subtitle = runs(o(o(columns[1], 'musicResponsiveListItemFlexColumnRenderer'), 'text'));
  // A video chart/compilation card is skipped, and is no track either.
  if (VIDEO_WORD.test(title) || VIDEO_WORD.test(subtitle)) return 'skip';
  return true;
}

/** InnertubeParser.parseResponsiveListItem: one track row as a Song. */
function parseResponsiveListItem(renderer) {
  if (!renderer) return null;
  const videoId =
    s(o(renderer, 'playlistItemData'), 'videoId') ??
    s(o(o(o(o(o(o(renderer, 'overlay'), 'musicItemThumbnailOverlayRenderer'), 'content'), 'musicPlayButtonRenderer'), 'playNavigationEndpoint'), 'watchEndpoint'), 'videoId');
  if (!videoId) return null;

  const columns = a(renderer, 'flexColumns') ?? [];
  const title = runs(o(o(columns[0], 'musicResponsiveListItemFlexColumnRenderer'), 'text'));
  if (!title.trim()) return null;

  const subtitleRuns = a(o(o(columns[1], 'musicResponsiveListItemFlexColumnRenderer'), 'text'), 'runs') ?? [];
  const subtitle = subtitleRuns.map((r) => s(r, 'text') ?? '').join('');
  const parts = subtitle.split(' • ').filter((p) => p.trim());
  const last = parts.at(-1);
  const duration =
    (last && DURATION.test(last) ? last : null) ??
    (a(renderer, 'fixedColumns') ?? [])
      .map((c) => runs(o(o(c, 'musicResponsiveListItemFixedColumnRenderer'), 'text')))
      .find((t) => DURATION.test(t)) ??
    null;
  const rowType = parts.find((p) => TYPE_WORDS.has(p.toLowerCase()))?.toLowerCase() ?? null;
  const artist = parts.find((p) => !DURATION.test(p) && !TYPE_WORDS.has(p.toLowerCase()) && !TALLY.test(p)) ?? null;

  const credits = creditsOf(columns.flatMap((c) => a(o(o(c, 'musicResponsiveListItemFlexColumnRenderer'), 'text'), 'runs') ?? []));
  const creditedArtists = artistNamesFromRuns(subtitleRuns);
  const episode = rowType === 'episode' || isPodcastEpisode(renderer);
  const showRun = episode ? subtitleRuns.find((run) => pageTypeOf(run).includes('PODCAST_SHOW')) : null;
  const show = showRun ? s(showRun, 'text')?.trim() || null : null;
  const thumbnails = a(o(o(o(renderer, 'thumbnail'), 'musicThumbnailRenderer'), 'thumbnail'), 'thumbnails');

  return {
    videoId,
    title,
    artist: creditedArtists ?? (credits.artistName?.trim() ? credits.artistName : null) ?? show ?? artist ?? 'Unknown artist',
    thumbnailUrl: best(thumbnails),
    durationText: duration,
    albumName: credits.albumName,
    isVideo: !episode && (rowType === 'video' || isNotSquare(thumbnails)),
    isExplicit: hasExplicitBadge(renderer),
  };
}

/** InnertubeParser.parseCardShelfSong: the promoted top result of a search. */
function parseCardShelfSong(renderer) {
  const videoId = s(o(o(renderer, 'onTap'), 'watchEndpoint'), 'videoId');
  if (!videoId) return null;
  const title = runs(o(renderer, 'title'));
  if (!title.trim()) return null;
  const subtitleRuns = a(o(renderer, 'subtitle'), 'runs') ?? [];
  const subtitle = subtitleRuns.map((r) => s(r, 'text') ?? '').join('');
  const parts = subtitle.split(' • ').filter((p) => p.trim());
  const last = parts.at(-1);
  const duration = last && DURATION.test(last) ? last : null;
  const rowType = parts.find((p) => TYPE_WORDS.has(p.toLowerCase()))?.toLowerCase() ?? null;
  const credits = creditsOf(subtitleRuns);
  const creditedArtists = artistNamesFromRuns(subtitleRuns);
  const artist = parts.find((p) => !DURATION.test(p) && !TYPE_WORDS.has(p.toLowerCase()) && !TALLY.test(p)) ?? null;
  const thumbnails = a(o(o(o(renderer, 'thumbnail'), 'musicThumbnailRenderer'), 'thumbnail'), 'thumbnails');
  return {
    videoId,
    title,
    artist: creditedArtists ?? (credits.artistName?.trim() ? credits.artistName : null) ?? artist ?? 'Unknown artist',
    thumbnailUrl: best(thumbnails),
    durationText: duration,
    albumName: credits.albumName,
    isVideo: rowType === 'video' || isNotSquare(thumbnails),
    isExplicit: hasExplicitBadge(renderer.subtitleBadges),
  };
}

/**
 * InnertubeParser.parseSearchPage(response, includeVideos): the tracks of a
 * search page, de-duplicated by video id. With includeVideos false (the Songs
 * search), music-video rows are dropped, as BitChord's search() does.
 * (The artist-card credit fallback only applies to the unfiltered All page.)
 */
export function parseSearchPage(response, includeVideos = false) {
  const seen = new Set();
  const out = [];
  if (!includeVideos) {
    for (const card of collectRenderers(response, 'musicCardShelfRenderer')) {
      const song = parseCardShelfSong(card);
      if (song && !song.isVideo && !seen.has(song.videoId)) {
        seen.add(song.videoId);
        out.push(song);
      }
    }
  }
  for (const renderer of collectRenderers(response, 'musicResponsiveListItemRenderer')) {
    if (isBrowseItem(renderer)) continue;
    const song = parseResponsiveListItem(renderer);
    if (song && song.isVideo === includeVideos && !seen.has(song.videoId)) {
      seen.add(song.videoId);
      out.push(song);
    }
  }
  return out;
}

/** YtMusicRepository.search(query, SONGS): the catalogue songs (never videos) for [query]. */
export async function searchSongs(query) {
  return parseSearchPage(await searchRaw(query, SEARCH_SONGS), false);
}

// ── Watch queue (`next`) ───────────────────────────────────────────────────

const musicVideoType = (renderer) =>
  s(o(o(o(o(renderer, 'navigationEndpoint'), 'watchEndpoint'), 'watchEndpointMusicSupportedConfigs'), 'watchEndpointMusicConfig'), 'musicVideoType');

const MUSIC_VIDEO_TYPE_ATV = 'MUSIC_VIDEO_TYPE_ATV';

/** InnertubeParser.panelSong: one watch-queue row as a Song. */
export function panelSong(renderer) {
  const videoId = s(renderer, 'videoId');
  if (!videoId) return null;
  const title = runs(o(renderer, 'title'));
  if (!title.trim()) return null;
  const bylineRuns = a(o(renderer, 'longBylineText'), 'runs') ?? [];
  const byline = bylineRuns.map((r) => s(r, 'text') ?? '');
  const artistRuns = [];
  for (const b of byline) {
    if (b.includes('•')) break;
    artistRuns.push(b);
  }
  const credits = creditsOf(bylineRuns);
  return {
    videoId,
    title,
    artist: artistRuns.join('').trim(),
    thumbnailUrl: best(a(o(renderer, 'thumbnail'), 'thumbnails')),
    durationText: runs(o(renderer, 'lengthText')).trim() ? runs(o(renderer, 'lengthText')) : null,
    albumName: credits.albumName,
    // A catalogue track is credited "Artist • Album • Year"; the matching
    // music video is "Artist • 417M views • 2.4M likes".
    isVideo: byline.some((b) => b.toLowerCase().includes('views')),
    isExplicit: hasExplicitBadge(renderer),
    musicVideoType: musicVideoType(renderer),
  };
}

/** The row of [videoId] itself in its own `next` response, as a Song, or null. */
export function seedSong(response, videoId) {
  const row = collectRenderers(response, 'playlistPanelVideoRenderer').find((r) => s(r, 'videoId') === videoId);
  return row ? panelSong(row) : null;
}

/**
 * InnertubeParser.parseVersionPair(root, videoId, wantAudio): the other
 * version of [videoId] as YouTube Music itself pairs it (its Song/Video
 * switch), or null. Signed out, YouTube pairs nothing.
 */
export function parseVersionPair(root, videoId, wantAudio) {
  const fits = (r) => {
    const type = musicVideoType(r);
    return type != null ? (type === MUSIC_VIDEO_TYPE_ATV) === wantAudio : true;
  };
  const rendererOf = (c) => o(o(c, 'counterpartRenderer'), 'playlistPanelVideoRenderer');
  for (const wrapper of collectRenderers(root, 'playlistPanelVideoWrapperRenderer')) {
    const primary = o(o(wrapper, 'primaryRenderer'), 'playlistPanelVideoRenderer');
    if (!primary) continue;
    const counterparts = (a(wrapper, 'counterpart') ?? []).filter(isObj);
    if (s(primary, 'videoId') === videoId) {
      const match = counterparts.find((c) => rendererOf(c) && fits(rendererOf(c)));
      if (!match) continue;
      const song = panelSong(rendererOf(match));
      if (!song) continue;
      return { ...song, isVideo: !wantAudio };
    }
    const asCounterpart = counterparts.find((c) => s(rendererOf(c), 'videoId') === videoId);
    if (!asCounterpart) continue;
    if (!fits(primary)) continue;
    const song = panelSong(primary);
    if (!song) continue;
    return { ...song, isVideo: !wantAudio };
  }
  return null;
}
