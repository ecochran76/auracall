---
name: oracle-chatgpt
description: Run the Oracle CLI for ChatGPT browser automation, including config setup (chatgptUrl, chromePath/profile, thinking time), manual login, and troubleshooting cookie/session issues. Use when the user wants ChatGPT answers via oracle, needs browser-mode setup, or wants to adjust ChatGPT model/URL settings.
---

# Oracle ChatGPT (browser mode)

## Quick start
- Set config values, then run ChatGPT via the browser engine.

Config keys (in `~/.oracle/config.json`):
- `browser.target: "chatgpt"`
- `browser.chatgptUrl: "https://chatgpt.com/g/.../project"` (optional)
- `browser.chromePath: "C:/Program Files/.../brave.exe"`
- `browser.chromeProfile: "Default"`
- `browser.chromeCookiePath: "C:/Users/<You>/.../Network/Cookies"` (optional but helps profile inference)
- `browser.thinkingTime: "extended"` (optional)

Run examples:
```bash
oracle --chatgpt -p "Say hello from Brave"
oracle --engine browser --model gpt-5.2 -p "Summarize this"
```

## Login flow
- If cookies are missing or you need a fresh session, open the configured profile:
```bash
oracle login --target chatgpt
```
- Sign in in the opened browser window; the CLI does not wait for the window to close.

## WSL note
- If `browser.chromePath` points to a Windows Brave/Chrome path, WSL launches the Windows browser profile.
- If you point `browser.chromePath` at a Linux browser in WSL, it will use Linux profiles instead.

## Troubleshooting
- If ChatGPT is not signed in, re-run `oracle login --target chatgpt` and sign in.
- If the wrong profile opens, set `browser.chromeProfile` and/or `browser.chromeCookiePath`.
