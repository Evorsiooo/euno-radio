import path from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync, renameSync } from 'fs';
import { downloadSong, expandUrl, isYoutubeMix, sourceOf } from './download';
import { findOnYoutube } from './match';
import { parseSpotifyUrl, readSpotify } from './spotify';
import { jobContext } from './tools';

// One job per URL the website sends. Jobs run one at a time and songs one at a
// time (the VPS is small and YouTube dislikes bursts). Each job is saved as JSON
// under data/jobs so a pm2 reload resumes it instead of losing it.

const DATA_DIR = process.env.DOWNLOAD_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "jobs");
const KEEP_DAYS = 14;
const MAX_ITEMS = Number(process.env.DOWNLOAD_MAX_ITEMS) || 500;
// Pause between songs (YouTube dislikes bursts from one server IP).
const PAUSE_MS = Number(process.env.DOWNLOAD_PAUSE_MS ?? 5000);

const BOT_CHECK = /confirm you.re not a bot|sign in to confirm/i;
const BLOCKED = 'YouTube is asking the radio server to sign in (bot check), so downloads stopped. It needs a cookies file (YTDLP_COOKIES).';

const FINAL = new Set(['done', 'failed', 'cancelled']);
const ITEM_FINAL = new Set(['done', 'failed', 'needs_review', 'cancelled']);

const state = (globalThis.__eunoRadioJobs ??= { jobs: new Map(), queue: [], running: false, loaded: false, controllers: new Map() });

function save(job) {
  job.updatedAt = new Date().toISOString();
  mkdirSync(DATA_DIR, { recursive: true });
  const file = `${DATA_DIR}/${job.id}.json`;
  writeFileSync(`${file}.tmp`, JSON.stringify(job));
  renameSync(`${file}.tmp`, file);
}

function load() {
  if (state.loaded) return;
  state.loaded = true;
  if (!existsSync(DATA_DIR)) return;
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  for (const name of readdirSync(DATA_DIR)) {
    if (!name.endsWith('.json')) continue;
    const file = `${DATA_DIR}/${name}`;
    try {
      if (statSync(file).mtimeMs < cutoff) {
        unlinkSync(file);
        continue;
      }
      const job = JSON.parse(readFileSync(file, 'utf8'));
      state.jobs.set(job.id, job);
      if (!FINAL.has(job.state)) {
        // Interrupted by a restart: anything mid-way starts that song again.
        for (const item of job.items) if (!ITEM_FINAL.has(item.state)) item.state = 'queued';
        job.state = 'queued';
        state.queue.push(job.id);
      }
    } catch (e) {
      console.error(`Skipping unreadable job file ${name}:`, e.message);
    }
  }
  pump();
}

function counts(job) {
  const c = { queued: 0, done: 0, failed: 0, needs_review: 0, cancelled: 0 };
  for (const item of job.items) {
    if (item.state === 'done') c.done++;
    else if (item.state === 'failed') c.failed++;
    else if (item.state === 'needs_review') c.needs_review++;
    else if (item.state === 'cancelled') c.cancelled++;
    else c.queued++;
  }
  return c;
}

/** Validates the request and queues the job. Throws with a user-facing message. */
export function createJob({ url, meta }) {
  load();
  if (typeof url !== 'string' || !url.trim()) throw new Error('url is required');
  url = url.trim();
  const source = sourceOf(url);
  if (!source) throw new Error('Only YouTube, YouTube Music, SoundCloud and Spotify links are accepted');
  if (isYoutubeMix(url)) {
    throw new Error("YouTube Music mixes and radios can't be imported: YouTube makes them up for each listener and won't list them. Save the songs to a playlist and import that instead.");
  }
  if (source === 'spotify' && !parseSpotifyUrl(url)) throw new Error('Spotify link must be a track, album or playlist');

  const now = new Date().toISOString();
  const job = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    state: 'queued',
    url,
    source,
    meta: meta && typeof meta === 'object' ? meta : null,
    title: null,
    total: 0,
    sourceTotal: null,
    items: [],
    counts: null,
    error: null,
  };
  job.counts = counts(job);
  state.jobs.set(job.id, job);
  save(job);
  state.queue.push(job.id);
  pump();
  return job;
}

export function getJob(id) {
  load();
  return state.jobs.get(id) || null;
}

export function listJobs(limit = 50) {
  load();
  return [...state.jobs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(({ items, ...summary }) => summary);
}

export function cancelJob(id) {
  const job = getJob(id);
  if (!job) return null;
  if (FINAL.has(job.state)) return job;
  job.cancelRequested = true;
  // Kills the yt-dlp process or request in progress, even while reading the list.
  state.controllers.get(id)?.abort();
  for (const item of job.items) if (item.state === 'queued') item.state = 'cancelled';
  if (job.state === 'queued') {
    job.state = 'cancelled';
    state.queue = state.queue.filter((q) => q !== id);
  }
  job.counts = counts(job);
  save(job);
  return job;
}

async function pump() {
  if (state.running) return;
  state.running = true;
  try {
    while (state.queue.length) {
      const job = state.jobs.get(state.queue.shift());
      if (!job || FINAL.has(job.state)) continue;
      const controller = new AbortController();
      state.controllers.set(job.id, controller);
      try {
        await jobContext.run({ signal: controller.signal }, () => runJob(job));
      } catch (e) {
        if (job.cancelRequested) {
          job.state = 'cancelled';
          for (const item of job.items) if (!ITEM_FINAL.has(item.state)) item.state = 'cancelled';
        } else {
          job.state = 'failed';
          job.error = e.message;
          console.error(`Download job ${job.id} failed:`, e.message);
        }
      } finally {
        state.controllers.delete(job.id);
      }
      job.counts = counts(job);
      save(job);
    }
  } finally {
    state.running = false;
  }
}

// Resolves early when the job is cancelled.
const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

async function expand(job) {
  job.state = 'expanding';
  save(job);
  if (job.source === 'spotify') {
    const list = await readSpotify(parseSpotifyUrl(job.url));
    job.title = list.name;
    job.sourceTotal = list.total;
    job.items = list.tracks.slice(0, MAX_ITEMS).map((t, index) => ({ index, state: 'queued', spotify: t }));
  } else {
    const list = await expandUrl(job.url);
    job.title = list.title;
    job.sourceTotal = list.entries.length;
    job.items = list.entries.slice(0, MAX_ITEMS).map((e, index) => ({ index, state: 'queued', url: e.url, title: e.title }));
  }
  job.total = job.items.length;
  if (!job.total) throw new Error('Nothing to download at that link');
}

async function runJob(job) {
  if (!job.items.length) await expand(job);
  job.state = 'running';
  job.counts = counts(job);
  save(job);

  let first = true;
  let botChecks = 0;
  for (const item of job.items) {
    if (job.cancelRequested) break;
    if (item.state !== 'queued') continue;
    if (!first && PAUSE_MS) await sleep(PAUSE_MS, state.controllers.get(job.id)?.signal);
    first = false;
    if (job.cancelRequested || item.state !== 'queued') break;
    await runItem(job, item);
    job.counts = counts(job);
    save(job);
    // Three bot checks in a row means YouTube is blocking the VPS: stop asking.
    botChecks = item.state === 'failed' && BOT_CHECK.test(item.error) ? botChecks + 1 : 0;
    if (botChecks >= 3) {
      job.error = BLOCKED;
      break;
    }
  }
  for (const item of job.items) {
    if (item.state !== 'queued') continue;
    if (job.error) {
      item.state = 'failed';
      item.error = BLOCKED;
    } else {
      item.state = 'cancelled';
    }
  }
  job.state = job.cancelRequested ? 'cancelled' : job.error ? 'failed' : 'done';
}

async function runItem(job, item) {
  const stage = (s) => {
    item.state = s;
    save(job);
  };
  try {
    let url = item.url;
    if (item.spotify) {
      stage('matching');
      const { match, candidates } = await findOnYoutube(item.spotify);
      item.candidates = candidates.map(({ videoId, url, title, artists, album, durationSec, kind, score }) => ({
        videoId, url, title, artists, album, durationSec, kind, score,
      }));
      if (!match) {
        item.state = 'needs_review';
        return;
      }
      item.match = item.candidates.find((c) => c.videoId === match.videoId) || null;
      url = match.url;
    }
    item.song = await downloadSong(url, { onStage: stage, spotify: item.spotify || null });
    item.state = 'done';
    item.error = null;
  } catch (e) {
    if (job.cancelRequested) {
      item.state = 'cancelled';
      return;
    }
    item.state = 'failed';
    item.error = e.message;
  }
}

export function resumeJobs() {
  load();
}
