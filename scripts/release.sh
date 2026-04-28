#!/usr/bin/env bash
set -euo pipefail

# AuraCall release helper (npm)
# Phases: gates | artifacts | publish | smoke | tag | all
# Defaults to using the guardrail runner when available; falls back to env when
# the local wrapper's runtime is unavailable.

resolve_runner() {
  if [[ -n "${MCP_RUNNER:-}" ]]; then
    printf '%s\n' "$MCP_RUNNER"
    return
  fi
  if [[ -x ./runner ]] && command -v bun >/dev/null 2>&1; then
    printf '%s\n' "./runner"
    return
  fi
  printf '%s\n' "/usr/bin/env"
}

RUNNER="$(resolve_runner)"
VERSION="${VERSION:-$(node -p "require('./package.json').version")}" 
RELEASE_TEST_COMMAND="${RELEASE_TEST_COMMAND:-pnpm vitest run --maxWorkers 1 --testTimeout 15000}"

if [[ "${CODEX_MANAGED_BY_NPM:-}" == "1" ]]; then
  export NPM_CONFIG_PROGRESS=false
  export npm_config_progress=false
fi

banner() { printf "\n==== %s ====" "$1"; printf "\n"; }
run() { echo ">> $*"; "$@"; }

phase_gates() {
  banner "Gates (check/lint/test/build)"
  run "$RUNNER" pnpm run check
  run "$RUNNER" pnpm run lint
  # The default Vitest worker pool and 5s per-test timeout can trip otherwise
  # healthy browser/runtime unit tests under release-load scheduling; release
  # gates prefer deterministic serial workers with modest timeout headroom.
  run "$RUNNER" sh -lc "$RELEASE_TEST_COMMAND"
  run "$RUNNER" pnpm run build
}

phase_artifacts() {
  banner "Artifacts (npm pack + checksums)"
  run "$RUNNER" pnpm run build
  run "$RUNNER" npm pack --pack-destination /tmp

  # npm pack tarballs are not consistent for scoped packages:
  # - @scope/name -> scope-name-x.y.z.tgz
  # - name        -> name-x.y.z.tgz
  local packed
  packed=$(ls -1 "/tmp/"*"${VERSION}.tgz" 2>/dev/null | head -n1 || true)
  if [[ -z "${packed:-}" ]]; then
    echo "No tgz found in /tmp after npm pack" >&2
    exit 1
  fi

  local tgz="auracall-${VERSION}.tgz"
  mv "$packed" "$tgz"
  echo ">> shasum $tgz > ${tgz}.sha1"
  shasum "$tgz" > "${tgz}.sha1"
  echo ">> shasum -a 256 $tgz > ${tgz}.sha256"
  shasum -a 256 "$tgz" > "${tgz}.sha256"
}

phase_publish() {
  banner "Publish to npm"
  run "$RUNNER" pnpm publish --tag latest --access public
  run "$RUNNER" npm view auracall version
  run "$RUNNER" npm view auracall time
}

phase_smoke() {
  banner "Smoke test in empty dir"
  local tmp=/tmp/auracall-empty
  rm -rf "$tmp" && mkdir -p "$tmp"
  ( cd "$tmp" && npx -y auracall@"$VERSION" "Smoke from empty dir" --dry-run )
}

phase_tag() {
  banner "Tag and push"
  git tag "v${VERSION}"
  git push --tags
}

usage() {
  cat <<'EOF'
Usage: scripts/release.sh [phase]

Phases (run individually or all):
  gates      pnpm check, lint, test, build
  artifacts  npm pack + sha1/sha256
  publish    pnpm publish --tag latest --access public, verify npm view
  smoke      empty-dir npx auracall@<version> --dry-run
  tag        git tag v<version> && push tags
  all        run everything in order

Environment:
  MCP_RUNNER (default ./runner) - guardrail wrapper
  RELEASE_TEST_COMMAND (default "pnpm vitest run --maxWorkers 1 --testTimeout 15000")
  VERSION    (default from package.json)
EOF
}

main() {
  local phase="${1:-all}"
  case "$phase" in
    gates) phase_gates ;;
    artifacts) phase_artifacts ;;
    publish) phase_publish ;;
    smoke) phase_smoke ;;
    tag) phase_tag ;;
    all) phase_gates; phase_artifacts; phase_publish; phase_smoke; phase_tag ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
