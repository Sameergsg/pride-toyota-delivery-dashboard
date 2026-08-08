# Azure AD / Microsoft Graph setup

The dashboard reads live data from a SharePoint-hosted Excel workbook via
Microsoft Graph. To enable live sync, a **tenant admin** needs to register a
small "daemon" app (client-credentials flow — no user sign-in, no redirect
URI) and grant it read-only access to the file.

This only needs to be done **once**. Follow the numbered steps below, then
hand the four values you collect back to whoever is finishing the setup (or
add them straight to GitHub Actions secrets yourself — see step 6).

---

## 1. Register the app

1. Go to the [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID**
   (formerly Azure AD) → **App registrations** → **New registration**.
2. Name it something recognizable, e.g. `pride-toyota-delivery-dashboard-sync`.
3. **Supported account types**: "Accounts in this organizational directory
   only" (single tenant) is fine.
4. **Redirect URI**: leave blank — this app never signs a user in.
5. Click **Register**.

## 2. Create a client secret

1. In the new app's page, go to **Certificates & secrets** → **Client
   secrets** → **New client secret**.
2. Give it a description and an expiry (12 months is reasonable).
3. Click **Add**, then **immediately copy the "Value" column** — this is
   the only time it's shown in full. If you navigate away before copying
   it, you'll have to create a new one.
4. **Note the expiry date somewhere** (e.g. a calendar reminder) — the
   secret must be rotated (steps 2 + 6 repeated) before it expires, or the
   sync workflow will start failing with 401s.

## 3. Grant Microsoft Graph Application permissions

1. Go to **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Application permissions** (not Delegated — this app has no signed-in
   user).
2. Add:
   - `Sites.Read.All`
   - `Files.Read.All` (add this too if `Sites.Read.All` alone isn't
     sufficient for your tenant's sharing configuration)
3. Click **Add permissions**.
4. Click **Grant admin consent for <your org>** and confirm. Without this
   step the permissions are requested but not active — Graph calls will
   return 403.

## 4. Record your three values

From the app's **Overview** page:

| Value | Where to find it |
|---|---|
| **Tenant ID** | "Directory (tenant) ID" |
| **Application (client) ID** | "Application (client) ID" |
| **Client secret** | The value you copied in step 2 (not shown again) |

## 5. The fourth value — SharePoint share URL

Already known — it's the link the workbook was shared with:

```
https://goyalsonsautomobilespvtl083-my.sharepoint.com/:x:/g/personal/edp_bhiwani_pridetoyota_in/IQAvAwAiAz4pRov7U8X8MHJ4AdSoT8BgpL4iuZTg6SM3tpA?e=ameVTp
```

The app registration above needs read access to this file specifically —
since it's shared under `edp.bhiwani@pridetoyota.in`'s personal OneDrive/
SharePoint site, `Sites.Read.All` (application-level, tenant-wide) is what
lets the sync script resolve and read it via Graph's `/shares/{shareId}`
endpoint regardless of which site it lives on.

## 6. Add the four values as GitHub Actions secrets

In the repo: **Settings → Secrets and variables → Actions → New repository
secret**. Add all four:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `SHAREPOINT_SHARE_URL`

Once these exist, the next scheduled run of `.github/workflows/sync.yml`
(every 30 minutes, or trigger it manually via **Actions → Sync Data → Run
workflow**) will pull live data and the dashboard will switch from the
bundled mock dataset to real numbers automatically.

### Local development

Copy `.env.example` to `.env.local` and fill in the same four values, then:

```bash
node --env-file=.env.local scripts/sync.mjs
```

`.env.local` is gitignored — it never gets committed.
