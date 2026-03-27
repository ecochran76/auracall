---
name: oracle-gemini
description: Run the Oracle CLI for Gemini web automation or API usage, including gem URL targeting, cookie export/login, and config setup (geminiUrl, chromePath/profile). Use when the user wants Gemini answers via oracle, needs gemini browser-mode setup, or wants to switch between Gemini web and API.
---

# Oracle Gemini

## Gemini web (browser mode)
- Uses signed-in cookies from a Chrome/Brave profile; no API key required.

Config keys (in `~/.auracall/config.json`):
- `browser.target: "gemini"`
- `browser.geminiUrl: "https://gemini.google.com/gem/<id>"`
- `browser.chromePath: "C:/Program Files/.../brave.exe"`
- `browser.chromeProfile: "Default"`
- `browser.chromeCookiePath: "C:/Users/<You>/.../Network/Cookies"`

Login + export cookies (recommended on Windows):
```bash
oracle login --target gemini --export-cookies
```

Run example:
```bash
oracle --gemini -p "Say hello from Brave"
```

## WSL note
- When `browser.chromePath` points to a Windows path, WSL launches the Windows browser.
- Prefer a WSL-installed Chrome for Gemini web runs:
  - `browser.chromePath: "/usr/bin/google-chrome"`
  - `browser.chromeCookiePath: "/home/<you>/.config/google-chrome/Default/Cookies"`
- Cookie export writes to `~/.auracall/cookies.json` inside WSL. If you exported on Windows, copy it:
```bash
cp /mnt/c/Users/<You>/.auracall/cookies.json ~/.auracall/cookies.json
```

## Gemini API (optional)
- Set `GEMINI_API_KEY` and use `--engine api` with a Gemini model:
```bash
oracle --engine api --model gemini-3-pro -p "Explain X"
```

## Troubleshooting
- If Gemini web says cookies are missing, rerun `oracle login --target gemini --export-cookies`.
- If the wrong profile opens, set `browser.chromeProfile` and/or `browser.chromeCookiePath`.
