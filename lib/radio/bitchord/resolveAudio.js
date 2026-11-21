import { isSignedIn, nextRaw, parseVersionPair, searchSongs, seedSong } from './innertube';
import { best, bestOfficialAudioForVideo, queries, secondsOf, targetOf } from './trackMatcher';
import { fetchSignal } from '../tools';

// BitChord's YtMusicRepository.resolveAudio (Evorsiooo/BitChord at acf219a7,
// shared/src/jvmSharedMain/.../data/YtMusicRepository.kt), copied step for
// step: the catalogue (audio-only) release of a music-video upload.
//   1. Not a video: the song itself.
//   2. YouTube Music's own pairing (its Song/Video switch), when signed in.
//   3. For each TrackMatcher query: a Songs search, TrackMatcher.best, then
//      TrackMatcher.bestOfficialAudioForVideo (the same song by a credited
//      artist, whatever the video's intro/outro adds to the runtime).
//   4. Nothing found: the video itself ("playing the video's own audio track
//      beats guessing at a substitute").
// One addition to BitChord (Adrien, 2026-11-21): before step 4, step 3 runs
// once more with our library's own title and artist for the song ([names]),
// when they give queries step 3 hasn't already searched.
// BitChord keeps the answer in a session cache; here the answer is stored in
// the song's JSON in R2 instead (download.js), and a failed search is not an
// answer, exactly as BitChord does not cache one.

/** A short pause between YouTube Music requests (yt-dlp's --sleep-requests is 1 s too). */
const GAP_MS = 1000;
const pause = () =>
  new Promise((resolve) => {
    const signal = fetchSignal(GAP_MS + 1000);
    const t = setTimeout(resolve, GAP_MS);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

const candidateOf = (song) => ({
  title: song.title,
  artist: song.artist,
  durationSec: secondsOf(song.durationText),
  album: song.albumName ?? null,
  explicit: song.isExplicit ?? null,
});

/** best()/bestOfficialAudioForVideo() take candidates; this keeps the Song each one came from. */
const withSong = (songs) => songs.map((song) => ({ ...candidateOf(song), song }));

/**
 * The audio to download for YouTube video [videoId].
 * { seed, audio, outcome, query } where seed is the video's own Song (null if
 * YouTube Music didn't list it), audio the Song to download (seed when it is
 * already a song or nothing matched), outcome one of
 *   'song'          the link already is the catalogue song
 *   'official-pair' YouTube Music's own Song/Video pairing
 *   'search'        TrackMatcher.best on a Songs search
 *   'search-drift'  TrackMatcher.bestOfficialAudioForVideo on a Songs search
 *   'no-match'      a music video with no catalogue song: kept as the video
 *   'lookup-failed' YouTube Music didn't answer: try again later
 * via is 'library-names' when the match came from the second attempt with
 * [names] ({ title, artist }, our library's names); namesTried says whether
 * that attempt searched anything.
 */
export async function resolveAudio(videoId, { names = null } = {}) {
  let response;
  try {
    response = await nextRaw(videoId);
  } catch (e) {
    if (e.name === 'CancelledError' || e.name === 'AbortError') throw e;
    return { seed: null, audio: null, outcome: 'lookup-failed', error: e.message };
  }
  const seed = seedSong(response, videoId);
  if (!seed) return { seed: null, audio: null, outcome: 'lookup-failed', error: 'YouTube Music did not list this video' };
  if (!seed.isVideo) return { seed, audio: seed, outcome: 'song' };

  // officialVersion: asked only signed in ("Signed out, YouTube pairs nothing,
  // so the request is not made at all"); the `next` response is the same one.
  if (await isSignedIn()) {
    const pair = parseVersionPair(response, videoId, true);
    if (pair) return { seed, audio: pair, outcome: 'official-pair' };
  }

  const target = targetOf(seed);
  let searchFailed = null;
  const tried = new Set();
  /** BitChord's step 3 for [t]: null when nothing matched. */
  const searchFor = async (t) => {
    for (const query of queries(t)) {
      if (tried.has(query)) continue;
      tried.add(query);
      await pause();
      let songs = [];
      try {
        songs = await searchSongs(query);
      } catch (e) {
        if (e.name === 'CancelledError' || e.name === 'AbortError') throw e;
        searchFailed = e.message;
      }
      const candidates = withSong(songs);
      const match = best(candidates, t);
      if (match) return { audio: match.song, outcome: 'search', query };
      const drift = bestOfficialAudioForVideo(candidates, t);
      if (drift) return { audio: drift.song, outcome: 'search-drift', query };
    }
    return null;
  };
  const found = await searchFor(target);
  if (found) return { seed, ...found };

  // The second attempt, with our library's names (not BitChord's).
  let namesTried = false;
  const title = names?.title?.trim();
  if (title) {
    const before = tried.size;
    const again = await searchFor({ ...target, title, artist: names.artist?.trim() || target.artist });
    namesTried = tried.size > before;
    if (again) return { seed, ...again, via: 'library-names', namesTried };
  }
  if (searchFailed) return { seed, audio: null, outcome: 'lookup-failed', error: searchFailed, namesTried };
  return { seed, audio: seed, outcome: 'no-match', namesTried };
}
