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

  // 1. Try Last.fm if configured
  if (!imageUrl && config.lastFmApiKey) {
    try {
      const lastFmUrl = `http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${config.lastFmApiKey}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json`;
      const res = await fetch(lastFmUrl);
      const data = await res.json();
      if (data.track && data.track.album && data.track.album.image) {
        // Last.fm returns an array of images of different sizes. Grab the largest ('extralarge' or 'mega')
        const images = data.track.album.image;
        const img = images.find(i => i.size === 'extralarge') || images.find(i => i.size === 'large') || images[images.length - 1];
        if (img && img['#text']) {
          imageUrl = img['#text'];
        }
      }
    } catch (err) {
      console.error("Last.fm fetch error:", err);
    }
  }

  // 2. Fallback to iTunes (No API key required)
  if (!imageUrl) {
    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + title)}&entity=song&limit=1`;
      const res = await fetch(itunesUrl);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        // iTunes returns a 100x100 image, we can replace '100x100' with '600x600' for higher quality
        let url = data.results[0].artworkUrl100;
        imageUrl = url.replace('100x100', '600x600');
      }
    } catch (err) {
      console.error("iTunes fetch error:", err);
    }
  }

  // 3. Fallback to fanart.tv if configured (Music -> album or artist)
  // Fanart is trickier as you need musicbrainz ID first usually, but we'll leave a placeholder structure if they have a key
  // For standard track lookups, Last.fm + iTunes usually covers 99%.
  if (!imageUrl && config.fanartTvApiKey) {
    // Note: Implementing complete fanart.tv requires first fetching MusicBrainz ID.
    // For simplicity and speed, if iTunes fails, fanart likely needs a complex multi-step lookup.
    // Assuming LastFM & iTunes cover almost everything.
    console.log("Fanart.tv fallback skipped: Requires MusicBrainz ID resolution which is slow.");
  }

  // Default fallback image if nothing is found
  if (!imageUrl) {
    imageUrl = '/default-album-art.svg'; // We'll place a placeholder image in public/
  }

  // Cache the result
  cache.set(cacheKey, imageUrl);
  return imageUrl;
}
