# User-Scoped Runtime

Use this when you want the day-to-day `auracall` command to run from an
installed user-owned package copy instead of from the live repo checkout.
This is the primary dogfood/install path while public npm distribution is
deferred.

## Install From The Current Checkout

```bash
pnpm run install:user-runtime
```

The command:

- runs `pnpm run build`
- packs the current checkout with `npm pack`
- installs the package tarball into `~/.auracall/user-runtime`
- writes wrappers to `~/.local/bin/auracall` and
  `~/.local/bin/auracall-mcp`

Verify:

```bash
~/.local/bin/auracall --version
~/.local/bin/auracall config show --team auracall-solo
```

Make sure `~/.local/bin` is on `PATH` if you want `auracall` to resolve to the
user-scoped runtime by default.

## Options

```bash
pnpm run install:user-runtime -- --prefix ~/.auracall/user-runtime --bin-dir ~/.local/bin
pnpm run install:user-runtime -- --skip-build
pnpm run install:user-runtime -- --dry-run
```

Use `--skip-build` only when `dist/` already reflects the current checkout.

## Runtime State

The installed package copy is separate from the repo, but Aura-Call runtime
state stays in the normal user state directory:

- config: `~/.auracall/config.json`
- browser/account state: `~/.auracall/browser-state.json`
- managed browser profiles: `~/.auracall/browser-profiles/...`
- runtime runs and runners: `~/.auracall/runtime/...`

That means the installed runtime can reuse the same signed-in managed browser
profiles that repo dogfooding used.
