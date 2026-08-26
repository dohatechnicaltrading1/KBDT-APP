# Kashinagar Blood Donation Team (KBDT) App

Bilingual (EN/BN) donor management app. Google Sheets is the database,
Google Apps Script is the API, and the frontend is a single HTML file
wrapped in a thin Android WebView shell so it installs as a real APK.

```
kbdt-app/
├── Code.gs              ← paste into Google Apps Script (backend + database)
├── index.html            ← the whole app (also copied into android/app/.../assets/www)
├── android/               ← Android WebView wrapper project (produces the APK)
└── .github/workflows/     ← builds the APK automatically on GitHub
```

## Step 1 — Backend: Google Sheet + Apps Script

1. Go to sheets.google.com → create a new blank sheet. Name it "KBDT Database".
2. Extensions → Apps Script. Delete the default code, paste in all of **Code.gs**.
3. In the function dropdown (top toolbar) select **setup**, click **Run**.
   - Approve the permissions Google asks for.
   - This creates every tab (Users, Donations, Requests, Advisory, Committee,
     Gallery, Quiz, Questions, Results, Settings) and seeds the admin account.
4. Deploy → New deployment → gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**, copy the **Web app URL** (ends in `/exec`).
5. **Admin login** (change the password immediately after first login):
   - Username: `Fahim`
   - Password: `Fahimisthebest`

Whenever you edit Code.gs later, use Deploy → **Manage deployments** → edit →
**New version** so the live URL picks up your changes.

## Step 2 — Connect the frontend to the backend

Open `index.html`, find this near the top of the `<script>` block:

```js
const CONFIG = {
  API_URL: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE'
};
```

Replace it with the Web app URL from Step 1. **Do this in both**:
- `index.html`
- `android/app/src/main/assets/www/index.html` (the copy bundled into the APK)

## Step 3 — Push to GitHub

```bash
cd kbdt-app
git init
git add .
git commit -m "KBDT app: Sheets backend + Android WebView wrapper"
git branch -M main
git remote add origin https://github.com/<your-username>/kbdt-app.git
git push -u origin main
```

## Step 4 — Get the APK (no Android Studio needed)

The repo includes `.github/workflows/build-apk.yml`, which builds the APK for
you automatically in the cloud every time you push changes to `android/`.

1. After pushing, go to your GitHub repo → **Actions** tab.
2. Open the "Build APK" run (or click **Run workflow** to trigger it manually).
3. When it finishes (a few minutes), open the run → **Artifacts** →
   download `kbdt-app-debug-apk`. Unzip it — that's `app-debug.apk`.
4. Send that APK to a donor's phone (WhatsApp, Google Drive, etc.) and open it.
   They may need to allow "Install unknown apps" for that source once.

This is a **debug** APK — fine for your team and volunteer donors to install
directly. If you later want to publish on the Play Store, that build needs to
be signed with a release key (ask me when you're ready for that step).

### If you'd rather build it locally in Android Studio instead
Open the `android/` folder as a project in Android Studio, let it sync, then
Build → Build Bundle(s) / APK(s) → Build APK(s).

## Notes

- The Android wrapper just loads the bundled `index.html` in a WebView — all
  the real logic and data lives in Google Sheets/Apps Script, so updating the
  app later mostly means editing `index.html` and re-running the GitHub
  Action (no need to touch the Android/Java code again).
- Donor contact details (mobile, address) are only ever sent to a requester
  after an Organizer/Admin approves their request — enforced in Code.gs, not
  just hidden in the UI.
- Eligibility is auto-calculated as `last donation date + 90 days` — never
  manually stored, so it can't drift out of sync.
- To add more organizer accounts later, log in as Admin → More → Manage
  Organizers.
