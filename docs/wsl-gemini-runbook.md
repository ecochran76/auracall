# WSL Runbook: Aura-Call Gemini Browser

Goal: Run Gemini web automation from WSL using the same Brave profile you sign into on Windows.

## Key behavior
- From WSL, Aura-Call launches Windows Brave when the selected browser profile's
  `chromePath` points at `C:/Program Files/.../brave.exe` or
  `/mnt/c/Program Files/.../brave.exe`.
- `auracall login --target gemini --export-cookies` writes to
  `~/.auracall/cookies.json` inside WSL.

## Recommended setup (WSL)
1) Ensure the selected AuraCall runtime profile points to a Windows Brave browser profile:

```json5
{
  version: 3,
  defaultRuntimeProfile: "gemini-windows-brave",
  browserProfiles: {
    "windows-brave": {
      chromePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
      sourceCookiePath: "C:/Users/<You>/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies",
      sourceProfileName: "Default",
      wslChromePreference: "windows",
    },
  },
  runtimeProfiles: {
    "gemini-windows-brave": {
      browserProfile: "windows-brave",
      engine: "browser",
      defaultService: "gemini",
      services: {
        gemini: {
          url: "https://gemini.google.com/gem/<id>",
        },
      },
    },
  }
}
```

2) Export cookies from WSL (opens Windows Brave, waits, writes `~/.auracall/cookies.json`):

```bash
auracall login --target gemini --export-cookies
```

3) Run Gemini:

```bash
auracall --engine browser --model gemini-3-pro --profile gemini-windows-brave --prompt "Say hello from Brave"
```

## If the export hangs
- The login command is detached and should not hang. If it times out:
  - Confirm `browser.chromePath` points to the correct Windows Brave.
  - Make sure Brave launches and you are signed in on the profile shown.
  - Try again once after signing in.

## If Gemini shows `google.com/sorry` or a CAPTCHA / human-verification page

- Treat that as a real anti-bot block, not a normal selector or route-settle
  failure.
- Until Aura-Call has first-class captcha automation, the page requires human
  interaction to clear.
- Do not keep retrying automated commands against that same managed browser
  profile while the block is active.
- Clear it manually in the live browser first, then resume with the
  lowest-churn path:
  - one real AuraCall command
  - then one bounded `browser-tools` inspection only if still needed
- Avoid repeated direct `/app/<id>` route opens while debugging Gemini on the
  same session; prefer an already-open, hydrated Gemini tab when possible.

## Fallback: export on Windows, copy into WSL
If you already exported on Windows:

```bash
cp /mnt/c/Users/<You>/.auracall/cookies.json ~/.auracall/cookies.json
```

Then rerun:

```bash
auracall --engine browser --model gemini-3-pro --profile gemini-windows-brave --prompt "Say hello from Brave"
```

## Notes
- Gemini runs use inline cookies first; the fallback to Chrome cookie DB on Windows can fail if Brave is locked. `--export-cookies` is the reliable path.
- Gemini anti-bot pages (`google.com/sorry`, CAPTCHA, reCAPTCHA, human
  verification) are currently manual-clear only.
- To use a Linux browser instead, point the selected browser profile's
  `chromePath` at the Linux Chrome/Brave binary in WSL and sign in there;
  cookies will come from that Linux source browser profile.
- Linux desktop (non-WSL) may require `libsecret-tools` so `secret-tool` can decrypt Chrome cookies; if that fails, use `--export-cookies` and `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/cookies.json`.
