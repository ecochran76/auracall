# Linux Notes

- Browser engine now works on Linux (Chrome/Chromium/Edge) without the old `DISPLAY` guard. Oracle will launch whatever `chrome-launcher` finds or what you pass via `CHROME_PATH`.
- Cookie sync supports snap-installed Chromium automatically. Common cookie DB for the Default profile:
  - `~/snap/chromium/common/chromium/Default/Cookies`
- If you use a non-default profile or a custom install, point Oracle at the correct paths:
  - `--browser-chrome-path /path/to/chrome`
  - `--browser-cookie-path /path/to/profile/Default/Cookies`
- Browser runs are headful (Cloudflare blocks headless). Keep a compositor/virtual display running if you don’t have a desktop session.
- If cookie sync still can’t find your DB, rerun with `--browser-allow-cookie-errors --browser-no-cookie-sync` and sign in manually, or dump the session cookies with `--browser-inline-cookies-file`.
- Gemini web mode relies on decrypting Chrome cookies via `secret-tool` (libsecret). If you see `Failed to read Linux keyring via secret-tool`, install it with `sudo apt-get install -y libsecret-tools`.
- If Gemini still can’t read cookies, export them from a logged-in Chrome tab and pass them inline:
  - `DISPLAY=:0.0 pnpm tsx scripts/browser-tools.ts cookies --port <PORT> > ~/.oracle/cookies.json`
  - Run with `ORACLE_BROWSER_COOKIES_FILE=~/.oracle/cookies.json` (or set `browser.inlineCookiesFile` in `~/.oracle/config.json`).
