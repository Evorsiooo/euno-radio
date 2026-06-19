// Simple in-memory cache for album art URLs
const cache = new Map();

export function clearAlbumArtCache() {
  cache.clear();
}

/**
 * Normalizes artist and title for cache key
 */
function getCacheKey(artist, title) {
  return `${artist?.toLowerCase()?.trim()}-${title?.toLowerCase()?.trim()}`;
}

export async function fetchAlbumArt(artist, title, config) {
  if (!artist || !title) return null;

  const cacheKey = getCacheKey(artist, title);
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  let imageUrl = null;

  // Default priority if not configured
  const priorityOrder = [
    config.apiPriority1 || 'lastfm',
    config.apiPriority2 || 'itunes',
    config.apiPriority3 || 'fanart'
  ];

  // Helper functions for each API
  const fetchers = {
    lastfm: async () => {
      if (!config.lastFmApiKey) return null;
      try {
        const url = `http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${config.lastFmApiKey}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.track && data.track.album && data.track.album.image) {
          const images = data.track.album.image;
          const img = images.find(i => i.size === 'extralarge') || images.find(i => i.size === 'large') || images[images.length - 1];
          if (img && img['#text']) return img['#text'];
        }
      } catch (err) { console.error("Last.fm fetch error:", err); }
      return null;
    },
    itunes: async () => {
      try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + title)}&entity=song&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          return data.results[0].artworkUrl100.replace('100x100', '600x600');
        }
      } catch (err) { console.error("iTunes fetch error:", err); }
      return null;
    },
    fanart: async () => {
      if (!config.fanartTvApiKey) return null;
      // Fanart requires MusicBrainz ID first, so it's a placeholder unless fully implemented.
      console.log("Fanart.tv fallback skipped: Requires MusicBrainz ID resolution which is slow.");
      return null;
    }
  };

  // Execute fetchers in order
  for (const api of priorityOrder) {
    if (fetchers[api]) {
      imageUrl = await fetchers[api]();
      if (imageUrl) break; // Found an image, stop searching
    }
  }

  // Default fallback image if nothing is found
  if (!imageUrl) {
    imageUrl = '/default-album-art.svg';
  }

  // Cache the result
  cache.set(cacheKey, imageUrl);
  return imageUrl;
}
