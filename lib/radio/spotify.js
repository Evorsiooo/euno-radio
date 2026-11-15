import { fetchSignal } from './tools';

// Spotify's Web API needs a Premium developer app, so track lists come from the
// public embed page (the widget sites use), which carries the data as JSON.
// The embed lists at most 100 tracks; the full page's music:song_count meta tag
// says how many the playlist really has, so a cut list can be reported.

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export function parseSpotifyUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    const m = /^spotify:(track|album|playlist):([A-Za-z0-9]+)$/.exec(input.trim());
    return m ? { type: m[1], id: m[2] } : null;
  }
  if (url.hostname !== 'open.spotify.com') return null;
  // /track/ID, /intl-fr/track/ID, /embed/playlist/ID
  const m = /\/(track|album|playlist)\/([A-Za-z0-9]+)/.exec(url.pathname);
  return m ? { type: m[1], id: m[2] } : null;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en' },
    signal: fetchSignal(30_000),
  });
  if (!res.ok) throw new Error(`Spotify returned ${res.status} for ${url}`);
  return res.text();
}

function nextData(html) {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('Spotify embed page had no track data (layout changed?)');
  const entity = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error('Spotify embed page had no entity (private or removed?)');
  return entity;
}

const splitArtists = (subtitle) =>
  (subtitle || '')
    .split(',')
    .map((s) => s.replace(/ /g, ' ').trim())
    .filter(Boolean);

/**
 * { name, type, total, tracks: [{ spotifyId, title, artists[], durationMs, explicit }] }
 * total is the real track count when Spotify says it, else tracks.length.
 */
export async function readSpotify({ type, id }) {
  const entity = nextData(await fetchText(`https://open.spotify.com/embed/${type}/${id}`));

  if (type === 'track') {
    return {
      name: entity.name || entity.title,
      type,
      total: 1,
      tracks: [
        {
          spotifyId: entity.id,
          title: entity.title || entity.name,
          artists: (entity.artists || []).map((a) => a.name),
          durationMs: entity.duration || null,
          explicit: !!entity.isExplicit,
        },
      ],
    };
  }

  const tracks = (entity.trackList || [])
    .filter((t) => (t.entityType || 'track') === 'track' && t.uri?.startsWith('spotify:track:'))
    .map((t) => ({
      spotifyId: t.uri.split(':')[2],
      title: t.title,
      artists: splitArtists(t.subtitle),
      durationMs: t.duration || null,
      explicit: !!t.isExplicit,
    }));

  let total = tracks.length;
  if (tracks.length >= 100) {
    try {
      const page = await fetchText(`https://open.spotify.com/${type}/${id}`);
      const m = /<meta name="music:song_count" content="(\d+)"/.exec(page);
      if (m) total = Math.max(total, Number(m[1]));
    } catch {
      // The count is only informative.
    }
  }

  return { name: entity.name || entity.title, type, total, tracks };
}
