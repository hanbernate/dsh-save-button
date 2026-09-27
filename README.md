# dsh-download-button

English | [中文](README.zh.md)

Adds a **Download** button next to **Open** on DSH Web GUI **delivery cards**: files the model delivered with
`present` (a zipped build, a report, a dataset, images…) go straight to your machine through the browser —
no SFTP/SCP detour.

```
┌──────────────────────────────────────────────────────────────────┐
│  📄  HexHowitzer-windows-x86_64.zip                    ┌────────┐ │
│      Preview in sidebar                                │ Open ▾ │ │  ← official card
│                                                        └────────┘ │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  📄  HexHowitzer-windows-x86_64.zip           ┌────────┐ ┌──────┐ │
│      Preview in sidebar                        │ Open ▾ │ │ ⬇ Download │  ← with this plugin
│                                                └────────┘ └──────┘ │
└──────────────────────────────────────────────────────────────────┘
```

Most useful when DSH runs remotely or inside a container (cloud host, GPU box, WSL, intranet server): the file
lives on the Host, the browser is in your hands, and the only thing missing is a button.

## Features

- **One-click download from the delivery card**: every file declared by `present` gets a **Download** button.
  It responds with `Content-Disposition: attachment`, so the browser's own download manager streams it to disk —
  a 100 MB zip never has to fit in page memory.
- **Official card abilities preserved**: clicking the card or **Open** previews the file in the sidebar; the
  `▾` menu still offers the official **Open in default app** and **Open containing folder** / **Show in Finder** /
  **Show in File Explorer**, disabled with an explanation when the Host has no desktop.
- **In-place status feedback**: Preparing download… / Download started / Download failed. Click to retry.
  Open and reveal report their own status the same way.
- **No interference with official rendering**: the "Files changed" chips and the multi-file collapse
  (`All N files` / `Collapse`) keep working, and a Turn without a delivery is left entirely to the official
  renderer.
- **Zero dependencies, zero build**: a plain ESM host half plus a hand-written browser bundle — no `postinstall`,
  no compile step.
- **Bilingual UI**: follows the GUI language (English / 中文).
- **Works on both DSH `0.1.5-rc.*` and `0.1.7-rc.*`**: see [Supported DSH versions](#supported-dsh-versions).

## Install

Install from npm into your web profile:

```sh
dsh plugin --profile web add dsh-download-button
```

A git checkout works too — the package has no build step, so `lib/` ships as-is:

```sh
dsh plugin --profile web add github:hanbernate/dsh-download-button
```

For local development, link this checkout instead so edits take effect through Loader recomposition:

```sh
dsh plugin --profile web add /path/to/dsh-download-button
```

If `dsh` is not on your `PATH`, use the CLI you started the Web GUI with, for example:

```sh
node ~/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js \
  plugin --profile web add dsh-download-button
```

This appends `dsh-download-button` to the profile's `dsh.profile.bundles` and lets the Loader insert the entry
declared in this package's `cordis.patch.yml`. A `link:` install keeps the Host half live through Loader
recomposition; an npm or git install serves the published code.

To take effect:

- **Reload the browser page** after installing (the browser half is a bundle loaded with the page, so a reload is
  what fetches it again).
- If the button still does not appear after a reload, restart the Web GUI: `dsh web` (or however you start it).

To verify: have the agent `present` any file (for instance `ls` a zip you just built) and a **Download** button
shows up on the right of the card.

## Usage

The button sits to the right of the official **Open** button, one per delivered file:

| Action | Behavior |
|---|---|
| **Download** | first sends `HEAD /api/download.button?sessionId=…&seq=…&index=…` to probe availability, then hands the file to the browser's download manager with `<a download>`; the file name comes from the Host's `Content-Disposition` |
| **Open** | same as official: previews the file in the sidebar |
| **▾ menu** | official actions: open in default app / open containing folder (Finder / File Explorer); disabled when the Host has no desktop |
| **On failure** | the reason is shown in place (e.g. "file is no longer in this session") and the same button retries |
| **More than 4 files** | the official collapse is preserved: `All N files` / `Collapse` |

Downloads are addressed **only** by the `(sessionId, seq, index)` triple — there is no `path` parameter — so the
only files that can be downloaded are the ones this session declared with `present`. Resolution, containment and
type checks, and chunked reads all happen in the Host half. See
[doc/architecture.md](doc/architecture.md) (Chinese).

## Supported DSH versions

| DSH RC | `turnTail` contract | Integration | Status |
|---|---|---|---|
| 0.1.0-rc.2 … 0.1.2-rc.1 | — (no `present` / `workspaceFiles`) | not applicable | not supported |
| 0.1.5-rc.1 / rc.2 / rc.3 | chain | claims the whole turn row with `priority: -1` and draws the card itself | supported (rc.3 verified 11/11) |
| 0.1.7-rc.1 / rc.2 | list | official card untouched; injects a Download button into `deliverables.file.actions` | supported (rc.2 verified 12/12) |

> At init time the plugin picks its adapter from what the runtime **actually declares** — a client plugin cannot
> read the DSH version — so one installation works on both lines. The contract list, test layers, itemized
> verification records and the tag-switching handbook are in [doc/compatibility.md](doc/compatibility.md) (Chinese).

## Uninstall

```sh
dsh plugin --profile web remove dsh-download-button
```

Then reload the page. Once the plugin is gone the official delivery card is back exactly as before — this plugin
never modifies any official file.

## Troubleshooting

| Symptom | What to do |
|---|---|
| No **Download** button on the card | reload the page first; then check that `dsh-download-button` is listed in `dsh.profile.bundles` in `~/.dsh/profiles/web/package.json`; if it still does not show up, restart `dsh web` |
| Button appears, click reports "Download failed. Click to retry." | open the browser devtools and look at the `/api/download.button?...` response: 401/403 = authentication, 404 = that declaration is not in the Session (different session, or the event was pruned), 422 = not a regular file / outside the workspace |
| **Open** reports "Open failed" | expected when the Host has no desktop (a headless server); use **Download** or the sidebar preview instead |
| `exports["./client"] must be a string` | the `exports` field in `package.json` got broken; run `npm test` for the guard |
| Edited `lib/client.js` but nothing changed | reload the page (the Host serves the bundle by revision, and it is not refetched until the page reloads) |

## Docs

The detailed docs under `doc/` are currently written in Chinese:

| Document | Contents |
|---|---|
| [doc/architecture.md](doc/architecture.md) | how a download works end to end, the two halves, the adapter + capability-probe selector, the icon capability table, security boundary, design decision records |
| [doc/compatibility.md](doc/compatibility.md) | support matrix, official contract list (C1–C10), history of the two breaking points, test layers and cases, real-machine verification records (V1–V17), tag-switching handbook |
| [doc/development.md](doc/development.md) | directory layout, running tests, how edits take effect, steps for adding an adapter, pre-release checklist, development pitfalls |

## License

MIT, see [LICENSE](LICENSE).
