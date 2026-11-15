import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { getText, putFile, putJson } from './r2';
import { ytdlpJson } from './tools';

// Downloads one song with yt-dlp and copies the file to R2 exactly as YouTube or
// SoundCloud served it: no transcoding, no remuxing, no levelling, no analysis.

// YouTube's AAC (itag 140) first, as the radio plan asks; other sources take
// their best audio as served.
const YT_FORMAT = '140/bestaudio[ext=m4a]/bestaudio';
const OTHER_FORMAT = 'bestaudio/best';

const CONTENT_TYPES = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  webm: 'audio/webm',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
};

const ALLOWED_HOSTS = {
  'youtube.com': 'youtube',
  'www.youtube.com': 'youtube',
  'm.youtube.com': 'youtube',
  'music.youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'soundcloud.com': 'soundcloud',
  'www.soundcloud.com': 'soundcloud',
  'm.soundcloud.com': 'soundcloud',
  'on.soundcloud.com': 'soundcloud',
  // Set entries yt-dlp lists by API link.
  'api.soundcloud.com': 'soundcloud',
  'api-v2.soundcloud.com': 'soundcloud',
  'open.spotify.com': 'spotify',
};

/** 'youtube' | 'soundcloud' | 'spotify', or null for anything we refuse. */
export function sourceOf(input) {
  if (/^spotify:(track|album|playlist):/.test(input || '')) return 'spotify';
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return ALLOWED_HOSTS[url.hostname.toLowerCase()] || null;
  } catch {
    return null;
  }
}

/** The video id when the URL points at exactly one YouTube video. */
export function youtubeVideoId(input) {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null;
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const m = /^\/(?:shorts|live|embed)\/([\w-]{11})/.exec(url.pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * YouTube "Mix" and radio lists (list=RD...) are generated per listener and
 * endless; YouTube refuses to list them ("This playlist type is unviewable").
 */
export function isYoutubeMix(input) {
  try {
    const list = new URL(input).searchParams.get('list') || '';
    return list.startsWith('RD') && !youtubeVideoId(input);
  } catch {
    return false;
  }
}

const metaKey = (source, id) => `songs/${source}/${id}.json`;

/**
 * Lists what a URL contains without downloading: one entry for a single song,
 * every entry for a playlist, album or SoundCloud set.
 * { title, entries: [{ url, title }] }
 */
export async function expandUrl(input) {
  if (youtubeVideoId(input)) return { title: null, entries: [{ url: input, title: null }] };

  const data = await ytdlpJson(['--flat-playlist', '-J', input], { timeoutMs: 3 * 60_000 });
  if (data._type !== 'playlist') {
    return { title: null, entries: [{ url: data.webpage_url || input, title: data.title || null }] };
  }
  const entries = (data.entries || [])
    .filter((e) => e && (e.url || e.id))
    .map((e) => ({
      url: e.url || (e.ie_key === 'Youtube' ? `https://www.youtube.com/watch?v=${e.id}` : e.webpage_url),
      title: e.title || null,
    }))
    .filter((e) => e.url);
  return { title: data.title || null, entries };
}

function loudnessFromPages(pages) {
  for (const text of pages) {
    const m = /"loudnessDb"\s*:\s*(-?\d+(?:\.\d+)?)/.exec(text);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * Downloads one song (a single video or track URL) to R2. Returns the song's
 * metadata, which is also stored next to the audio as songs/<source>/<id>.json.
 * When that JSON already exists the song is not downloaded again.
 * spotify: the Spotify track it was matched for, stored with the metadata.
 */
export async function downloadSong(input, { onStage, spotify } = {}) {
  const source = sourceOf(input);
  if (!source || source === 'spotify') throw new Error('Not a YouTube or SoundCloud song URL');

  const knownId = source === 'youtube' ? youtubeVideoId(input) : null;
  if (knownId) {
    const existing = await getText(metaKey('youtube', knownId));
    if (existing) return { ...JSON.parse(existing), alreadyStored: true };
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'euno-radio-'));
  try {
    onStage?.('downloading');
    const args = [
      '-f', source === 'youtube' ? YT_FORMAT : OTHER_FORMAT,
      '--no-playlist',
      '--fixup', 'never',
      '--no-mtime',
      // Space out the several page and API requests yt-dlp makes per song.
      '--sleep-requests', '1',
      '--max-filesize', '200M',
      '-o', path.join(dir, 'audio.%(ext)s'),
      '--no-simulate',
      '-J',
    ];
    // The watch page carries YouTube's loudness figure; keeping yt-dlp's own copy
    // of the pages avoids asking YouTube a second time.
    if (source === 'youtube') args.push('--write-pages');
    args.push(input);

    const info = await ytdlpJson(args, { cwd: dir, timeoutMs: 15 * 60_000 });
    const download = info.requested_downloads?.[0];
    const filePath = download?.filepath || download?._filename;
    if (!filePath) throw new Error('yt-dlp reported no downloaded file');

    const id = info.id;
    const ext = path.extname(filePath).slice(1).toLowerCase() || info.ext;
    const audioKey = `songs/${source}/${id}.${ext}`;

    let loudnessDb = null;
    if (source === 'youtube') {
      const dumps = (await readdir(dir)).filter((f) => f.endsWith('.dump'));
      loudnessDb = loudnessFromPages(await Promise.all(dumps.map((f) => readFile(path.join(dir, f), 'utf8'))));
    }

    onStage?.('uploading');
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const bytes = await putFile(audioKey, filePath, contentType);

    // YouTube's own music fields (art tracks, Topic channels and videos with a
    // "Music" panel) name the real song; a plain upload only has its video
    // title and channel. Both are kept so the website can clean up the rest.
    const channel = (info.channel || info.uploader || '').trim() || null;
    const topicChannel = /\s-\sTopic$/.test(channel || '');
    const channelName = channel ? channel.replace(/\s-\sTopic$/, '') : null;
    const artists = Array.isArray(info.artists) && info.artists.length
      ? info.artists
      : info.artist
        ? info.artist.split(/,\s*/).filter(Boolean)
        : info.creators?.length
          ? info.creators
          : null;
    let metadataSource = info.track && artists ? 'tagged' : topicChannel ? 'topic-channel' : 'video';
    // A Spotify match already knows the real song: trust it over a raw upload.
    if (spotify && metadataSource === 'video') metadataSource = 'spotify';
    const fallbackArtists = topicChannel && channelName ? [channelName] : null;

    const song = {
      source,
      sourceId: id,
      sourceUrl: info.webpage_url || input,
      // Best guess, for display: music fields first, then the raw video data.
      title: metadataSource === 'spotify' ? spotify.title : info.track || info.title || null,
      artist:
        metadataSource === 'spotify'
          ? spotify.artists.join(', ')
          : (artists || fallbackArtists)?.join(', ') || channelName,
      // Where the guess came from: 'tagged' (the site's own track and artist fields, e.g. YouTube Music; reliable),
      // 'topic-channel' (auto-generated channel, artist reliable), 'spotify' (raw upload
      // matched from a Spotify track, title/artist taken from Spotify), 'video' (raw upload, needs cleanup).
      metadataSource,
      track: info.track || null,
      artists: artists || fallbackArtists,
      album: info.album || null,
      releaseYear: info.release_year || null,
      releaseDate: info.release_date || null,
      rawTitle: info.title || null,
      channel: channelName,
      channelIsTopic: topicChannel,
      spotify: spotify || null,
      durationSec: info.duration ?? null,
      thumbnail: info.thumbnail || null,
      loudnessDb,
      audio: {
        r2Key: audioKey,
        bytes,
        contentType,
        ext,
        formatId: download.format_id || info.format_id || null,
        codec: download.acodec || info.acodec || null,
        bitrateKbps: download.abr || info.abr || null,
        sampleRateHz: download.asr || info.asr || null,
        channels: download.audio_channels || info.audio_channels || null,
      },
      metaKey: metaKey(source, id),
      downloadedAt: new Date().toISOString(),
    };
    await putJson(song.metaKey, song);
    return { ...song, alreadyStored: false };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
