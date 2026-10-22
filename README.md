# Radio rotation service

The euno.cc webradio UI has moved to FTN+ (https://ftn.euno.cc/plus/radio). This small service is all that stays on the radio VPS: it runs the Icecast source-password rotation script on request.

## Endpoint

`POST /api/rotate` with `Authorization: Bearer $ADMIN_TOKEN`

Runs `/usr/local/bin/rotate_radio_pass.sh` (override with `ROTATE_SCRIPT_PATH`) and returns `{ "success": true, "newPassword": "..." }`. The script must print only the new password on stdout.

ftn.euno.cc calls this from Radio settings: set the **Rotation Endpoint URL** to `https://<this host>/api/rotate` and the **Rotation Endpoint Token** to `ADMIN_TOKEN`.

## Run

```bash
ADMIN_TOKEN=<long random string> npm run build && ADMIN_TOKEN=<same> npm start
```

`ADMIN_TOKEN` is required; without it every request is refused.

## History

The original webradio UI, link tracker, advertising page and admin panel are preserved under the git tag `legacy-euno-radio-v1`. Rotate the Icecast admin password and Google API key that appeared in earlier commits.
