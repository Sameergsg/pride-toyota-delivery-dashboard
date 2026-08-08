# Live sync setup — no tenant admin required

This dashboard reads live data from a SharePoint-hosted Excel workbook via
Microsoft Graph, using **delegated (user sign-in) authentication** — the
same pattern as Pride Toyota's existing Sales dashboard. You sign in
**once**, interactively, and the sync script keeps itself logged in after
that using a refresh token. No Azure AD tenant admin approval is needed, as
long as your organization allows normal users to consent to the `Files.Read`
permission for themselves (it does — that's why the existing Sales
dashboard's one-time login works).

---

## 1. Register a "public client" app (you can do this yourself)

1. Go to the [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID**
   → **App registrations** → **New registration**.
2. Name it `pride-toyota-delivery-dashboard-sync`.
3. **Supported account types**: "Accounts in this organizational directory
   only".
4. **Redirect URI**: leave blank.
5. Click **Register**.
6. Go to **Authentication** → scroll to **Advanced settings** → set
   **"Allow public client flows"** to **Yes** → **Save**. (This is what
   lets the app do a device-code sign-in without needing a client secret.)
7. Go to **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Delegated permissions** → search for and add `Files.Read` →
   **Add permissions**.
   - You do **not** need to click "Grant admin consent" here — you'll
     consent for yourself in step 3 below, the same way you did for the
     Sales dashboard. If your organization *has* locked down user consent
     tenant-wide, you'll see an error at that step and will need to ask an
     admin for this one click after all — but try step 3 first.

From the app's **Overview** page, note down:
- **Tenant ID** ("Directory (tenant) ID")
- **Application (client) ID**

## 2. Copy the environment template

```bash
cp .env.example .env.local
```

Fill in `AZURE_TENANT_ID` and `AZURE_CLIENT_ID` from step 1.
`SHAREPOINT_SHARE_URL` is already filled in.

## 3. Sign in once, interactively

```bash
node --env-file=.env.local scripts/get-token.mjs
```

This prints a URL and a short code — open the URL, enter the code, and
sign in with an account that has access to the workbook (e.g.
`edp.bhiwani@pridetoyota.in`). Approve the `Files.Read` permission when
prompted.

On success it prints a **refresh token** and also writes it into
`.env.local` as `AZURE_REFRESH_TOKEN` automatically, so local runs of
`scripts/sync.mjs` work right away:

```bash
node --env-file=.env.local scripts/sync.mjs
```

## 4. Create a GitHub PAT so the automated sync can stay logged in

Microsoft rotates the refresh token every time it's used — each sync run
gets a *new* one, and the old one stops working. So the automated
30-minute sync needs permission to update its own `AZURE_REFRESH_TOKEN`
secret after every run, or it'll only work once.

1. Go to **GitHub → Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token**.
2. **Repository access**: select only this repo
   (`pride-toyota-delivery-dashboard`).
3. **Permissions → Repository permissions → Secrets**: set to
   **Read and write**.
4. Generate, and copy the token — this is `GH_PAT` below.

## 5. Add all secrets to GitHub Actions

**Settings → Secrets and variables → Actions → New repository secret** —
add:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_REFRESH_TOKEN` (from step 3)
- `GH_PAT` (from step 4)
- `SHAREPOINT_SHARE_URL`

Once these exist, the next scheduled run of `.github/workflows/sync.yml`
(every 30 minutes, or trigger manually via **Actions → Sync Data → Run
workflow**) pulls live data, and the dashboard switches from the bundled
mock dataset to real numbers — fully automatically, with no further sign-ins.

### If the refresh token ever does stop working

Refresh tokens expire if unused for 90 days, or if the signed-in account's
password changes, or certain tenant security policies force re-auth. If
`sync.yml` starts failing with an auth error, just repeat step 3 (`node
--env-file=.env.local scripts/get-token.mjs`) and update the
`AZURE_REFRESH_TOKEN` GitHub secret with the new value.

---

## Alternative: application (client-credentials) flow

If your organization later *does* grant admin consent for an
application-level Graph permission (`Sites.Read.All`), `scripts/sync.mjs`
also supports the simpler client-credentials flow as a fallback — just add
an `AZURE_CLIENT_SECRET` GitHub secret instead of `AZURE_REFRESH_TOKEN`/
`GH_PAT`, and it'll be used automatically (no refresh-token rotation to
worry about, no GH_PAT needed). See the app registration's **Certificates &
secrets** page to create one, and grant `Sites.Read.All` under **API
permissions → Application permissions**, with admin consent.
