# Publishing to the Chrome Web Store

The extension is already listed as item `emmhdkcchcmgbpflohecdllhollepalh`. These
scripts update that listing from the command line instead of the developer console.

```bash
scripts/package.sh                    # build dist/knltb-tools-<version>.zip
scripts/publish-chrome.sh             # upload it as the draft
scripts/publish-chrome.sh --publish   # upload, then submit for review
```

Uploading only replaces the draft and can be repeated freely. Submitting for review
is the outward-facing step, which is why it needs the explicit `--publish` flag.

## One-time setup — service account (recommended)

Follows Google's [service accounts guide](https://developer.chrome.com/docs/webstore/service-accounts).
Unlike the OAuth flow below, there is no browser consent step and no token that
quietly expires after a week, which is why it's the better fit here.

### 1. Google Cloud

1. [Google Cloud console](https://console.cloud.google.com/) → create or pick a project.
2. **APIs & Services → Library** → enable **Chrome Web Store API**.
3. **IAM & Admin → Service Accounts** → create one. It needs **no roles or
   permissions** — its authority comes from the Developer Dashboard, not from IAM.
4. Open the service account → **Keys → Add key → Create new key → JSON**, and save
   the downloaded file somewhere outside the repo (for example
   `~/.config/knltb-tools/cws-service-account.json`, `chmod 600`).

### 2. Developer Dashboard — the step that actually grants access

In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/) go to
**Account** and add the service account's email address
(`something@your-project.iam.gserviceaccount.com`) as a user.

Nothing works until this is done: token requests fail with `invalid_grant` or the
upload returns a permission error. **A publisher can have only one service account**,
so if one is ever already registered, that's the one to use.

### 3. Point the script at the key

```bash
export CWS_SERVICE_ACCOUNT_KEY=~/.config/knltb-tools/cws-service-account.json
```

The script builds a signed JWT from the key (`scripts/cws-jwt.py`, using `openssl`
for the RSA signature) and exchanges it for a short-lived access token. Nothing
sensitive is written into the repository.

### Using gcloud instead of a key file

If you'd rather not have a key file on disk and you install the `gcloud` CLI, grant
your own account `roles/iam.serviceAccountTokenCreator` on the service account and
hand the script a token directly:

```bash
export CWS_ACCESS_TOKEN=$(gcloud auth print-access-token \
  --impersonate-service-account=<SA_EMAIL> \
  --scopes=https://www.googleapis.com/auth/chromewebstore)
```

## Alternative: OAuth refresh token

Still supported by the script via `CWS_CLIENT_ID` / `CWS_CLIENT_SECRET` /
`CWS_REFRESH_TOKEN`. It needs an interactive browser consent, and while the OAuth
consent screen is in *Testing* mode the refresh token expires after 7 days — set the
screen to *In production* to avoid that. The service account route has neither
problem.

## What to expect

- **Review is not instant.** `--publish` submits the item; Google's review usually
  takes hours but can take days. The listing updates itself once it passes.
- **Versions cannot be reused.** The store rejects an upload whose `manifest.json`
  version already exists, so bump the version before packaging.
- **A rejected review does not roll back the live listing** — the previous published
  version stays up until a new one is approved.

## Fitting it into the release flow

After the existing tag-and-release steps:

```bash
scripts/package.sh
scripts/publish-chrome.sh --publish
```

## Running it from CI instead

The same three credentials work as CI secrets, so this can move to a workflow that
triggers on a `v*` tag. Worth noting before doing that: the canonical remote is
Forgejo and GitHub is a mirror, so a GitHub Actions workflow would either need the
mirror to forward tag pushes, or the job would have to live in Forgejo Actions with
a runner attached. The local scripts avoid that question entirely.
