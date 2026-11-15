import { AsyncLocalStorage } from 'async_hooks';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

// PM2 does not always start with the login shell's PATH, so look for the tools
// where pipx and the deno installer put them before falling back to PATH.
function findBinary(envName, candidates, fallback) {
  if (process.env[envName]) return process.env[envName];
  return candidates.find((p) => existsSync(p)) || fallback;
}

const HOME = homedir();

// The running job's cancel signal, so Stop can kill whatever yt-dlp or fetch
// call is in progress without passing the signal through every function.
export const jobContext = (globalThis.__eunoRadioJobContext ??= new AsyncLocalStorage());

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

/** The current job's abort signal, or undefined outside a job. */
export const jobSignal = () => jobContext.getStore()?.signal;

/** A fetch signal that fires on timeout or when the job is cancelled. */
export function fetchSignal(timeoutMs) {
  const signal = jobSignal();
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

export const YTDLP = findBinary(
  'YTDLP_PATH',
  [path.join(HOME, '.local/bin/yt-dlp'), '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp'],
  'yt-dlp',
);

export const DENO = findBinary('DENO_PATH', [path.join(HOME, '.deno/bin/deno'), '/usr/local/bin/deno'], null);

/** Arguments every yt-dlp call gets: deno for YouTube's JS challenges, optional cookies. */
export function baseArgs() {
  const args = ['--ignore-config', '--no-warnings', '--no-progress'];
  if (DENO) args.push('--js-runtimes', `deno:${DENO}`, '--remote-components', 'ejs:github');
  if (process.env.YTDLP_COOKIES && existsSync(process.env.YTDLP_COOKIES)) {
    args.push('--cookies', process.env.YTDLP_COOKIES);
  }
  return args;
}

/** Runs a command and resolves with stdout; rejects with the last stderr lines. */
export function run(cmd, args, { cwd, timeoutMs = 10 * 60 * 1000 } = {}) {
  const cancel = jobSignal();
  if (cancel?.aborted) return Promise.reject(new CancelledError());
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let cancelled = false;
    const onCancel = () => {
      cancelled = true;
      child.kill('SIGKILL');
    };
    cancel?.addEventListener('abort', onCancel, { once: true });
    const out = [];
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => {
      err = (err + d.toString()).slice(-4000);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      cancel?.removeEventListener('abort', onCancel);
      reject(new Error(`${path.basename(cmd)} could not start: ${e.message}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      cancel?.removeEventListener('abort', onCancel);
      if (cancelled) return reject(new CancelledError());
      const stdout = Buffer.concat(out).toString();
      if (code === 0) return resolve(stdout);
      const lastLines = err.trim().split('\n').filter((l) => l.trim()).slice(-3).join(' | ');
      reject(new Error(signal ? `${path.basename(cmd)} timed out` : lastLines || `${path.basename(cmd)} exited with ${code}`));
    });
  });
}

export async function ytdlpJson(args, opts) {
  const stdout = await run(YTDLP, [...baseArgs(), ...args], opts);
  return JSON.parse(stdout);
}
