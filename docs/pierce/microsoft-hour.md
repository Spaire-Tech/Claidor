# The Microsoft hour

Everything Pierce needs from you and your Microsoft account, in order,
with the check after each step that proves it worked. Two halves:
**the tenant** (SharePoint/OneDrive/Outlook reading — the connector)
and **the add-in** (the panel inside PowerPoint/Excel/Word/Outlook).
They are independent; do them in either order.

What you need: a Microsoft 365 **work/school** account (add-ins and
Graph do not work on a purely personal @outlook.com account), and
admin rights on its Entra tenant — which you have automatically if
it's your own Microsoft 365 Business subscription.

---

## Half 1 — the tenant (≈ 25 minutes)

### 1. Register the app (Azure portal, ~10 min)

1. Go to **entra.microsoft.com** → Identity → Applications →
   **App registrations** → **New registration**.
2. Name: `Pierce` (what people see on the consent screen).
3. Supported account types: **"Accounts in any organizational
   directory (Any Microsoft Entra ID tenant – Multitenant)"** — so a
   customer's tenant can consent later without a new registration.
   (Not "personal Microsoft accounts": a deal room is never a personal
   OneDrive.)
4. Redirect URI: platform **Web**, value **exactly** what the
   preflight prints (step 3 below) — for local dev:
   `http://localhost:8000/v1/connector/microsoft/callback`
   For the deployed server:
   `https://<api-domain>/v1/connector/microsoft/callback`
   Both can be added; add each environment's as you need it.
   ⚠ Entra allows plain `http` only for `localhost` — use
   `localhost`, not `127.0.0.1`, in the dev redirect and in
   `CLAIDOR_BASE_URL`, or Entra will refuse the registration.
5. Register. From the **Overview** page copy:
   - **Application (client) ID** → `CLAIDOR_MICROSOFT_CLIENT_ID`
6. **Certificates & secrets** → New client secret. Copy the **Value**
   column immediately (it is shown once; the "Secret ID" column is not
   it) → `CLAIDOR_MICROSOFT_CLIENT_SECRET`. Note the expiry you chose:
   the connector dies the day the secret does, so put the date in your
   calendar.
7. **API permissions** → Add a permission → Microsoft Graph →
   **Delegated** → add:
   - `User.Read` (the name on the screen)
   - `Files.Read.All` (the deal room's files)
   - `Sites.Read.All` (listing the sites to pick a room from)
   - `Mail.Read` (drafts and sent items, for the outbox check)
   - `offline_access` (the refresh token — without it the connection
     dies after an hour)
   Then press **"Grant admin consent for <your tenant>"** — one click,
   because `Sites.Read.All` needs an admin's consent even as a
   delegated permission, and you are the admin. (When a *customer*
   connects later, their admin does this once for their tenant; the
   consent screen offers it.)

### 2. Configure the server (~2 min)

In `server/.env` (all with the `CLAIDOR_` prefix):

```
CLAIDOR_MICROSOFT_CLIENT_ID=<Application (client) ID>
CLAIDOR_MICROSOFT_CLIENT_SECRET=<the secret's Value>
CLAIDOR_MICROSOFT_TENANT=organizations
```

and **remove** the two dev-stub lines if present
(`CLAIDOR_MICROSOFT_GRAPH_BASE`, `CLAIDOR_MICROSOFT_LOGIN_BASE`) —
their defaults are the real Microsoft endpoints. `organizations` as
the tenant means any work account can sign in; your own tenant id
(also on the Overview page) restricts it to your company only, if you
prefer that while testing.

For local dev, also make sure `CLAIDOR_BASE_URL` uses `localhost`,
matching the registered redirect exactly.

### 3. Preflight (~1 min, no browser)

```bash
cd server && uv run python -m scripts.connector_doctor --preflight
```

This proves the registration **before** any sign-in: the tenant
resolves, and a client-credentials token request makes Entra genuinely
validate the id and secret — you want a line starting *"Client id and
secret accepted"*. A failed line names the mistake, including the
classic one: the UUID in Azure's "Secret ID" column is not the secret;
the **Value** shown once at creation is. It also prints the exact
redirect URI to double-check against step 1.4.

### 4. Connect, then the full doctor (~5 min)

Start the stack, open the workspace → Settings → Connections →
**Connect Microsoft** → sign in as yourself, accept the consent
screen. Then:

```bash
uv run python -m scripts.connector_doctor
```

It replays every call the connector makes — who you are, your drives,
a folder listing, a file download, each mail folder — one line each,
and says which call failed and what to do. **This code has never met a
real tenant; this is the moment it does.** If a line fails, send it to
Claude as it stands — one line, one cause.

### 5. The first real deal (~5 min)

Put a deck and a model in a SharePoint folder (or use an existing deal
room), then workspace → **New deal** → browse to the folder → create.
Watch it sync, then open the deal. That's the product on your own
files.

---

## Half 2 — the add-in (≈ 20 minutes)

Follow **`clients/apps/panel/SIDELOAD.md`** — the short version:

1. Deploy the dashboard (or tunnel a local build) so it's on https.
   The build serves the manifests itself.
2. Download `https://<dashboard-domain>/panel/manifest.xml`.
3. PowerPoint **on the web** (easiest first): Home → Add-ins → More
   Add-ins → My Add-ins → **Upload My Add-in** → the file. A
   **Claidor** button appears on the Home tab.
4. Open a deck whose file belongs to a deal → the panel identifies it
   and lists its findings; pressing one moves the document there.
5. Outlook is its own manifest (`/panel/manifest.outlook.xml`) via
   [aka.ms/olksideload](https://aka.ms/olksideload).

No Azure registration is needed for the add-in — it signs in through
the dashboard's own session, not through Entra.

**Expect the first sideload to surface something.** All the
Office-side code is unit-tested but has never run inside a real
PowerPoint. Whatever it does — a button that doesn't appear, a jump
that lands wrong — write down the exact words on screen and hand them
over; the plumbing was shaped so each symptom has one place to look.

---

## When something fails

- Preflight fail lines each carry their own fix.
- `AADSTS65001` at consent → the admin-consent click in step 1.7 was
  skipped.
- Redirect-URI error at sign-in → the registered URI and
  `CLAIDOR_BASE_URL` differ (scheme, host, or `localhost` vs
  `127.0.0.1` — they must match to the character).
- Anything else: `connector_doctor` first, then the API log — the
  connector logs every Graph refusal with the URL that refused.
