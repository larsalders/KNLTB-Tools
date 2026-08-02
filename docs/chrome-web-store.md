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

## One-time setup

This part has to be done by hand — it needs consent from a Google account in a
browser, and the credentials it produces cannot be generated non-interactively.

### 1. Enable the API

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a
   project (any name — it only exists to own the OAuth client).
2. Under **APIs & Services → Library**, enable **Chrome Web Store API**.

### 2. Create an OAuth client

1. **APIs & Services → OAuth consent screen** → External → fill in the required
   fields. It stays in *Testing* mode; add your own Google account under
   **Test users**. No verification is needed for personal use.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   → application type **Desktop app**.
3. Note the **client ID** and **client secret**.

Because the consent screen stays in Testing mode, refresh tokens expire after
7 days. To get a non-expiring token, set the consent screen to **In production**
(publishing status → Publish app). No Google review is required for this scope.

### 3. Get a refresh token

Open this URL in a browser, replacing `<CLIENT_ID>`:

```
https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=<CLIENT_ID>&redirect_uri=urn:ietf:wg:oauth:2.0:oob
```

Approve the request and copy the authorization code, then exchange it — the code is
single-use and expires within minutes, so do this straight away:

```bash
curl -s -X POST https://oauth2.googleapis.com/token \
  -d "client_id=<CLIENT_ID>" \
  -d "client_secret=<CLIENT_SECRET>" \
  -d "code=<AUTH_CODE>" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob"
```

The response contains `refresh_token`. That value is long-lived; treat it like a
password.

### 4. Store the three values

The scripts read credentials from the environment, so nothing sensitive is written
into the repository. Keeping them in the macOS keychain matches how the Forgejo and
GitHub credentials are already handled:

```bash
security add-generic-password -s chrome-webstore -a client_id     -w '<CLIENT_ID>'
security add-generic-password -s chrome-webstore -a client_secret -w '<CLIENT_SECRET>'
security add-generic-password -s chrome-webstore -a refresh_token -w '<REFRESH_TOKEN>'
```

Then before publishing:

```bash
export CWS_CLIENT_ID=$(security find-generic-password -s chrome-webstore -a client_id -w)
export CWS_CLIENT_SECRET=$(security find-generic-password -s chrome-webstore -a client_secret -w)
export CWS_REFRESH_TOKEN=$(security find-generic-password -s chrome-webstore -a refresh_token -w)
```

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
