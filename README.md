# Radio VPS service

The euno.cc webradio UI has moved to FTN+ (https://ftn.euno.cc/plus/radio). This small service is all that stays on the radio VPS: it runs the Icecast source-password rotation script, and downloads songs for the FTN+ radio to the R2 bucket.

## Endpoint

`POST /api/rotate` with `Authorization: Bearer $ADMIN_TOKEN`

Runs `/usr/local/bin/rotate_radio_pass.sh` (override with `ROTATE_SCRIPT_PATH`) and returns `{ "success": true, "newPassword": "..." }`. The script must print only the new password on stdout.

ftn.euno.cc calls this from Radio settings: set the **Rotation Endpoint URL** to `https://<this host>/api/rotate` and the **Rotation Endpoint Token** to `ADMIN_TOKEN`.

## Song downloads

`POST /api/download` with `{ "url": "..." }` (YouTube, YouTube Music, SoundCloud or Spotify link) and the same Bearer token queues a job; `GET /api/download/<jobId>` reports its progress and each song's metadata. yt-dlp downloads the audio (YouTube's AAC format 140 first) and the file goes to R2 untouched: no transcoding, remuxing, levelling or analysis happens here. Spotify track lists come from Spotify's public embed page and each track is matched on YouTube Music; unsure matches are left for review. Full spec: `plans/radio/download-api.md` in the FTN project files.

Needs yt-dlp, deno (for YouTube's JS challenges) and these in `.env.local`: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`. yt-dlp and deno are found in `~/.local/bin` and `~/.deno/bin` even when PM2's PATH lacks them (override with `YTDLP_PATH`, `DENO_PATH`). If YouTube ever starts asking the server to sign in, export a cookies.txt and set `YTDLP_COOKIES` to its path. Job state lives in `data/jobs/` (gitignored, survives `git reset --hard`).

## Song search

`GET /api/search?q=<words>` with the same Bearer token returns up to 20 songs from YouTube Music's Songs search (`videoId`, `title`, `artist`, `album`, `durationSec`, `thumbnail`, `url`). Read-only: it downloads and stores nothing. Answers are kept in memory for 10 minutes. ftn.euno.cc uses it for live search in the Library, the Studio and the AI tools; a pick becomes a normal `/api/download` of the song's link.

## Run

```bash
ADMIN_TOKEN=<long random string> npm run build && ADMIN_TOKEN=<same> npm start
```

`ADMIN_TOKEN` is required; without it every request is refused.

## History

The original webradio UI, link tracker, advertising page and admin panel are preserved in git history at commit `19c4aee` (the last commit before this reduction). Rotate the Icecast admin password and Google API key that appeared in earlier commits.
