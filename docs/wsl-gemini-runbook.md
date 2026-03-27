# WSL Runbook: Oracle Gemini Browser

Goal: Run Gemini web automation from WSL using the same Brave profile you sign into on Windows.

## Key behavior
- From WSL, Oracle launches the Windows Brave when `browser.chromePath` points at `C:/Program Files/.../brave.exe` or `/mnt/c/Program Files/.../brave.exe`.
- `oracle login --target gemini --export-cookies` writes to `~/.auracall/cookies.json` inside WSL.

## Recommended setup (WSL)
1) Ensure config points to Windows Brave and profile:

```json
{
  "browser": {
    "chromePath": "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
    "chromeCookiePath": "C:/Users/<You>/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies",
    "chromeProfile": "Default",
    "geminiUrl": "https://gemini.google.com/gem/<id>"
  }
}
```

2) Export cookies from WSL (opens Windows Brave, waits, writes `~/.auracall/cookies.json`):

```bash
oracle login --target gemini --export-cookies
```

3) Run Gemini:

```bash
oracle --gemini -p "Say hello from Brave"
```

## If the export hangs
- The login command is detached and should not hang. If it times out:
  - Confirm `browser.chromePath` points to the correct Windows Brave.
  - Make sure Brave launches and you are signed in on the profile shown.
  - Try again once after signing in.

## Fallback: export on Windows, copy into WSL
If you already exported on Windows:

```bash
cp /mnt/c/Users/<You>/.auracall/cookies.json ~/.auracall/cookies.json
```

Then rerun:

```bash
oracle --gemini -p "Say hello from Brave"
```

## Notes
- Gemini runs use inline cookies first; the fallback to Chrome cookie DB on Windows can fail if Brave is locked. `--export-cookies` is the reliable path.
- To use a Linux browser instead, set `browser.chromePath` to the Linux Chrome/Brave binary in WSL and sign in there; cookies will come from that Linux profile.
- Linux desktop (non-WSL) may require `libsecret-tools` so `secret-tool` can decrypt Chrome cookies; if that fails, use `--export-cookies` and `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/cookies.json`.
