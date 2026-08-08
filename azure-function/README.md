# Real-time sync (Azure Function)

This is the **real-time** path: a Graph webhook fires within seconds of the
source Excel workbook being saved, this Function re-reads the sheet, and
writes the result to a public blob the dashboard polls every 5 seconds.
The 30-minute GitHub Actions cron (`scripts/sync.mjs` / `.github/workflows/
sync.yml`) keeps running independently as a fallback — if this Function or
its webhook ever stops working, the dashboard still updates at least every
30 minutes, and this Function also has its own 15-minute fallback timer
(`fallbackSync`) as a second safety net.

**What "real-time" actually means here:** within a few seconds of Excel
Online (or a synced desktop Excel with AutoSave on) actually saving the
file — not literally as you type. That save happens automatically and
frequently during editing, so in practice this feels near-instant.

I don't have Azure CLI access in the environment this was built in, so the
resource creation below is written as manual Azure Portal steps. If you
have `az` CLI available, everything here can be scripted — ask and I can
write that version instead.

---

## 1. Create a Storage Account

1. [Azure Portal](https://portal.azure.com) → **Storage accounts** → **Create**.
2. Any name (e.g. `pridetoyotarealtime`), same resource group/region you'll
   use for the Function App below. **Standard** performance, **LRS**
   redundancy is fine (cheapest).
3. Create it. Once done, go to **Access keys** → copy a **Connection
   string** — you'll need this twice (step 5 and step 7).

## 2. Create the Function App

1. **Create a resource** → **Function App**.
2. **Runtime stack**: Node.js, **Version 20**, **Linux**, **Consumption**
   (pay-per-execution) hosting plan.
3. **Storage account**: pick the one you just created.
4. Create it. Wait for deployment to finish, then open the Function App
   resource.

## 3. Configure application settings

Function App → **Settings → Environment variables** (or **Configuration**
on older portal UI) → add these **Application settings**:

| Name | Value |
|---|---|
| `AZURE_TENANT_ID` | same value as the main repo's `.env.local` |
| `AZURE_CLIENT_ID` | same value as the main repo's `.env.local` |
| `SHAREPOINT_SHARE_URL` | the workbook share link |
| `GRAPH_CLIENT_STATE` | any random secret string you make up (e.g. run `openssl rand -hex 20` locally) — Graph echoes this back on every notification so we can verify it's genuinely from our subscription |
| `WEBHOOK_PUBLIC_URL` | `https://<your-function-app-name>.azurewebsites.net/api/webhook` |

(`AzureWebJobsStorage` is already set automatically to the storage account
from step 2 — that's what `shared/storage.js` uses for both the public
data blob and the private state blob.)

## 4. Enable CORS on the Storage Account (so the browser can read the blob)

Storage Account → **Settings → Resource sharing (CORS)** → **Blob service** tab:

| Allowed origins | Allowed methods | Allowed headers | Exposed headers | Max age |
|---|---|---|---|---|
| `https://sameergsg.github.io` | GET, HEAD, OPTIONS | `*` | `*` | `3600` |

Save. Without this, the dashboard's browser-side fetch to the public blob
will be blocked even though the blob itself is publicly readable.

## 5. Seed the initial refresh token

```bash
cd azure-function
npm install
cp .env.local.example .env.local
```

Fill in `azure-function/.env.local`:
- `AZURE_REFRESH_TOKEN` — reuse the value from the main repo's `.env.local`
  (made by `../scripts/get-token.mjs`), or run that script again for a
  fresh one.
- `STATE_STORAGE_CONNECTION_STRING` — the connection string from step 1.

```bash
node --env-file=.env.local bootstrap-state.mjs
```

## 6. Deploy the function code

**Via GitHub Actions (recommended, already set up):**

1. Function App → **Overview** → **Get publish profile** → download the
   XML file.
2. GitHub repo → **Settings → Secrets and variables → Actions**:
   - **Secrets** tab → New secret `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` →
     paste the XML file's contents.
   - **Variables** tab → New variable `AZURE_FUNCTIONAPP_NAME` → your
     Function App's name (not the full URL, just the name).
3. Push to `main` (or run `.github/workflows/deploy-function.yml` manually
   via **Actions** tab) — it builds and deploys automatically.

**Or manually**, with [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) installed:

```bash
cd azure-function
npm install
node sync-vendored.mjs
func azure functionapp publish <your-function-app-name>
```

## 7. Confirm the subscription got created

The `renewSubscription` timer runs once automatically on deploy
(`runOnStartup: true`). Function App → **Functions → renewSubscription →
Monitor** to check its logs — you should see "Created subscription ...".
If `driveId`/`itemId` weren't resolved yet, it runs a full sync first, so
this may take ~10-15 seconds the first time.

## 8. Point the dashboard at the live data

Your public data URL is:

```
https://<your-storage-account-name>.blob.core.windows.net/public-data/data.json
```

Add it as a GitHub Actions **repository variable** (not a secret — this
URL is meant to be public, it's fetched from the browser):

**Repo → Settings → Secrets and variables → Actions → Variables → New
variable** → `REALTIME_DATA_URL` → paste the URL above.

Then re-run `.github/workflows/deploy.yml` (push to `main`, or trigger it
manually) so the frontend build picks up `VITE_REALTIME_DATA_URL`. Once
deployed, the dashboard shows a pulsing **"LIVE"** badge in the header and
polls every 5 seconds.

---

## Testing it end-to-end

1. Edit a cell in the source Excel workbook and save.
2. Watch Function App → **Functions → webhook → Monitor** — a new
   invocation should appear within a few seconds.
3. Refresh the dashboard (or just wait — it's polling) and confirm the
   change appears.

If nothing shows up in the webhook's monitor after saving, check
`renewSubscription`'s most recent run — the subscription may have failed
to create (check `WEBHOOK_PUBLIC_URL` is reachable and exactly matches
your Function App's actual URL) or may need renewing.

## Cost

Consumption-plan Azure Functions bill per execution/GB-s with a generous
free monthly grant, and this workload is tiny (a webhook firing a handful
of times a day plus a 15-minute timer). Blob Storage costs are similarly
minor for a single small JSON file. In practice this should stay within
Azure's free tier for a workload this size — but keep an eye on the Azure
Portal's Cost Management if usage patterns change.
