# Contributing

Thanks for helping improve dsh-save-button. Install and usage live in the
[README](README.md) (Chinese: [README.zh.md](README.zh.md)).

## Branches and PR targets

- `main` is the **trunk**; `0.1.x` is the **current maintenance / release line** — every
  `v0.1.x` tag is cut from `0.1.x`.
- **Open your PR against `0.1.x`, not `main`.** When creating the PR, check the base
  branch selector under the title and make sure it says `0.1.x`.
- Both branches currently point at the same commit. If you are unsure which branch a
  change belongs to, open an issue first.

## Development and tests

- Node.js ≥ 22; tests run with `node --test`: `npm test`.
- **The test suite must be green before you open a PR.** The client half is loaded through
  `test/client-harness.mjs`: the bundle is materialized through a stub loader, and
  `document.baseURI` at materialize time decides the API prefix (a root deployment
  degenerates to `/api/...`).
- When your change touches an official contract surface (slot declarations, primitives
  exports, host-route semantics), add verification following the test layers (L0–L5) in
  [doc/compatibility.md](doc/compatibility.md) and sync that document plus the support
  matrices in both READMEs — the README compatibility table may only claim RCs that are
  green in the matrix.
- Follow the existing conventional-commit style (`test:` / `docs:` / `chore:` …).

## Documentation

- [README.md](README.md) / [README.zh.md](README.zh.md) are a bilingual pair; keep them in
  sync.
- For compatibility questions, start with [doc/compatibility.md](doc/compatibility.md)
  (support matrix, contract list C1–C10, itemized verification records, tag-switching
  handbook). Architecture and design rationale are in [doc/architecture.md](doc/architecture.md);
  directory layout, running tests and the pre-release checklist are in
  [doc/development.md](doc/development.md) (Chinese).

## Releasing (maintainers)

1. Bump `version` in `package.json` and commit it together with the docs
   (e.g. `chore: release v0.1.7`).
2. Push a `vX.Y.Z` tag; `.github/workflows/publish.yml` runs `npm test` and then
   `npm publish` on every `v*` tag (requires the repository secret `NPM_TOKEN`).
