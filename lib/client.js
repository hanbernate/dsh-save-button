/**
 * dsh-save-button — browser half.
 *
 * Adds a 「下载」 button to the right of the delivery card's 打开 control, so a
 * file the model delivered with `present` (a build archive, a report, a
 * dataset) leaves the Host through the browser instead of SFTP.
 *
 * How it composes without patching official code, across both RC slot contracts:
 *
 * - DSH 0.1.5-rc.* declares `conversation.chat.turnTail` as a CHAIN slot: every
 *   contributor supplies a `select`, the first non-null match renders, and ties
 *   are ordered by ascending `priority`. This plugin registers at `priority: -1`
 *   and claims a turn only when that turn declared deliveries, so turns with no
 *   `present` call render through the official row untouched. The claimed row
 *   renders the changed-file chips and the delivery cards here, because a chain
 *   renders exactly one contribution.
 * - DSH 0.1.7-rc.* declares the same slot as a LIST whose entries render
 *   additively; a chain registration is refused. The official row stays as-is
 *   and the download button is contributed through the per-file
 *   `deliverables.file.actions` list the official delivery card declares.
 * - The button downloads through `/api/download.button`, addressed by the same
 *   (sessionId, seq, index) coordinates the durable declaration carries — never
 *   by a path. In list mode those coordinates are read from the official action
 *   URL the card hands to the child slot; no official deliverables import is
 *   needed.
 * - The card's own 打开 / 用默认应用打开 / 打开所在文件夹 actions reuse the
 *   official `/api/present.open` and `/api/present.host` routes, so native
 *   actions stay governed by the official desktop checks.
 */
window.__ModuleLoader__.load({
  id: 'dsh-save-button',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const { Menu, FileTypeIcon, LinkIcon, classifyLinkPath, fileExtension } = primitives
    /**
     * Icon generations this plugin may meet, oldest first:
     * - 0.1.5-rc.* exported size-suffixed names (`IconDownloadOutline16`; the two
     *   chevrons shipped `…14`);
     * - 0.1.7-rc.* renamed them to weight-suffixed names
     *   (`IconDownloadOutlineRegular` / `…Medium`) and removed the old ones;
     * - a bare `IconDownloadOutline` is exported by no released line and stays last as
     *   a defensive fallback.
     * Resolution walks a list in order and stops at the first name the running line
     * actually exports, so an older line never evaluates the newer names.
     */
    const ICON_GENERATIONS = {
      IconChevronDown: ['IconChevronDownOutline14', 'IconChevronDownOutlineRegular', 'IconChevronDownOutline'],
      IconChevronUp: ['IconChevronUpOutline14', 'IconChevronUpOutlineRegular', 'IconChevronUpOutline'],
      IconRightUp: ['IconRightUpOutline16', 'IconRightUpOutlineRegular', 'IconRightUpOutline'],
      IconFolderOpen: ['IconFolderOpenOutline16', 'IconFolderOpenOutlineRegular', 'IconFolderOpenOutline'],
      IconDownload: ['IconDownloadOutline16', 'IconDownloadOutlineRegular', 'IconDownloadOutline'],
    }

    /**
     * Resolve every icon this bundle renders against the primitives the running line
     * actually ships.
     * @param source - the ui-primitives module.
     * @returns one component per icon name, undefined where no generation matched.
     */
    function resolveIcons(source) {
      const resolved = {}
      for (const [name, generations] of Object.entries(ICON_GENERATIONS)) {
        resolved[name] = generations.map(candidate => source[candidate]).find(value => value !== undefined)
      }
      return resolved
    }

    const icons = resolveIcons(primitives)
    const { IconChevronDown, IconChevronUp, IconRightUp, IconFolderOpen, IconDownload } = icons

    const h = React.createElement

    /** This plugin's locale namespace and the storage key of its injected sheet. */
    const NS = 'downloadButton'
    const STYLE_ID = 'dsh-save-button/styles'

    /** Host routes: ours, plus the official file-action routes the card reuses. */
    const DOWNLOAD_PATH = '/api/download.button'
    const OPEN_PATH = '/api/present.open'
    const HOST_PATH = '/api/present.host'

    /** Delivery cards shown before the collapse control appears, and chips per produced row. */
    const COLLAPSED_DELIVERIES = 4
    const PRODUCED_CHIPS = 6

    /** How long a settled download/open status stays on the card. */
    const STATUS_MS = 4000

    const zh = {
      'produced.label': '本轮文件改动',
      'produced.moreOne': '+ 1 个文件',
      'produced.more': '+ {count} 个文件',
      'produced.open': '打开 {name}',
      'card.preview': '在侧边栏预览',
      'card.previewCard': '在侧边栏预览 {name}',
      'card.open': '打开',
      'card.openButton': '在侧边栏打开 {name}',
      'card.more': '{name} 的更多文件操作',
      'card.defaultApp': '用默认应用打开',
      'card.directory': '打开所在文件夹',
      'card.explorer': '在文件资源管理器中显示',
      'card.finder': '在 Finder 中显示',
      'card.file': '文件',
      'card.all': '全部 {count} 个文件',
      'card.expandAria': '展开全部 {count} 个交付文件',
      'card.collapseAria': '收起交付文件列表',
      'card.collapse': '收起',
      'download.action': '下载',
      'download.aria': '下载 {name}',
      'download.checking': '正在准备下载…',
      'download.started': '已开始下载',
      'download.error': '下载失败，点击重试',
      'open.opening': '正在打开…',
      'open.opened': '已请求用默认应用打开',
      'open.error': '打开失败，点击重试',
      'reveal.opening': '正在打开所在文件夹…',
      'reveal.opened': '已请求打开所在文件夹',
      'reveal.error': '无法打开所在文件夹，请重试',
      'host.error': '无法读取主机桌面信息',
      'host.retry': '重试',
      'host.unavailable': '此主机没有可用的桌面，无法打开文件或文件夹',
    }

    const en = {
      'produced.label': 'Files changed',
      'produced.moreOne': '+ 1 file',
      'produced.more': '+ {count} files',
      'produced.open': 'Open {name}',
      'card.preview': 'Preview in sidebar',
      'card.previewCard': 'Preview {name} in the sidebar',
      'card.open': 'Open',
      'card.openButton': 'Open {name} in the sidebar',
      'card.more': 'More file actions for {name}',
      'card.defaultApp': 'Open in default app',
      'card.directory': 'Open containing folder',
      'card.explorer': 'Show in File Explorer',
      'card.finder': 'Show in Finder',
      'card.file': 'File',
      'card.all': 'All {count} files',
      'card.expandAria': 'Show all {count} delivered files',
      'card.collapseAria': 'Collapse the delivered file list',
      'card.collapse': 'Collapse',
      'download.action': 'Download',
      'download.aria': 'Download {name}',
      'download.checking': 'Preparing download…',
      'download.started': 'Download started',
      'download.error': 'Download failed. Click to retry.',
      'open.opening': 'Opening…',
      'open.opened': 'Requested opening in the default app',
      'open.error': 'Open failed. Click to retry.',
      'reveal.opening': 'Opening containing folder…',
      'reveal.opened': 'Requested opening the containing folder',
      'reveal.error': 'Could not open the containing folder. Try again.',
      'host.error': 'Could not read the Host desktop information',
      'host.retry': 'Retry',
      'host.unavailable': 'This Host has no desktop available to open files or folders',
    }

    /** Card and chip styling: the official delivery-card language, plus the download pill. */
    const CSS = `
.ddb-root {
  --ddb-fill: var(--dsw-static-neutral-50);
  --ddb-hover: var(--dsw-static-neutral-100);
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  margin-top: 4px;
}
body[data-ds-dark-theme] .ddb-root {
  --ddb-fill: var(--dsw-static-neutral-850);
  --ddb-hover: var(--dsw-static-neutral-800);
}
.ddb-root[data-after-produced-files='true'] { margin-top: 0; }
.ddb-status { display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.ddb-status[data-error='true'] { color: var(--dsw-alias-state-error-primary); }
.ddb-retry {
  padding: 1px 8px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 8px;
  background: var(--dsw-alias-button-floating-fill);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.ddb-retry:hover { background: var(--dsw-alias-interactive-bg-hover); }
.ddb-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; min-width: 0; }
.ddb-cards[data-single='true'] { grid-template-columns: minmax(0, 1fr); }
.ddb-file {
  position: relative;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 60px;
  padding: 8px 10px;
  overflow: hidden;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 18px;
  background: var(--ddb-fill);
  color: var(--dsw-alias-label-primary);
  transition: background-color 120ms ease;
}
.ddb-file:hover { background: var(--ddb-hover); }
.ddb-cardPreview {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}
.ddb-cardPreview:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--dsw-alias-brand-primary); }
.ddb-fileIcon {
  position: relative;
  z-index: 2;
  box-sizing: border-box;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  overflow: hidden;
  pointer-events: none;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--ddb-fill);
  color: var(--dsw-alias-link);
}
.ddb-fileBody {
  position: relative;
  z-index: 2;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  pointer-events: none;
}
.ddb-details { display: flex; flex: 1; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; }
.ddb-fileName { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; line-height: 20px; }
.ddb-description { overflow: hidden; color: var(--dsw-alias-label-tertiary); font-size: 10px; font-weight: 400; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }
.ddb-description[data-error='true'] { color: var(--dsw-alias-state-error-primary); }
.ddb-previewHint { display: none; }
.ddb-file:hover .ddb-secondaryText { display: none; }
.ddb-file:hover .ddb-previewHint { display: inline; }
.ddb-actions { display: inline-flex; flex: none; align-items: stretch; gap: 6px; pointer-events: auto; }
.ddb-split {
  display: inline-flex;
  flex: none;
  align-items: stretch;
  box-sizing: border-box;
  height: 28px;
  overflow: hidden;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 10px;
  background: var(--dsw-alias-button-floating-fill);
}
.ddb-open, .ddb-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: none;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  font-family: var(--dsw-font-family);
}
.ddb-open { padding: 4px 8px; font-size: 12px; line-height: 18px; }
.ddb-chevron { padding: 4px 5px; border-left: 0.5px solid var(--dsw-alias-border-l3); color: var(--dsw-alias-label-secondary); }
.ddb-open:hover, .ddb-open:focus-visible, .ddb-chevron:hover:not(:disabled), .ddb-chevron:focus-visible { background: var(--dsw-alias-interactive-bg-hover); }
.ddb-chevron:disabled { color: var(--dsw-alias-label-dimmed); cursor: not-allowed; }
.ddb-menuIcon { display: block; width: 16px; height: 16px; }
.ddb-download {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  height: 28px;
  padding: 4px 9px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 10px;
  background: var(--dsw-alias-button-floating-fill);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.ddb-download:hover:not(:disabled), .ddb-download:focus-visible { background: var(--dsw-alias-interactive-bg-hover); }
.ddb-download:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--dsw-alias-brand-primary); }
.ddb-download:disabled { color: var(--dsw-alias-label-dimmed); cursor: progress; }
.ddb-downloadIcon { display: block; flex: none; width: 14px; height: 14px; }
.ddb-toggle {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 1px 11px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
}
.ddb-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); }
.ddb-toggle svg { flex: none; width: 14px; height: 14px; }
.ddb-produced { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: start; column-gap: 8px; margin-top: 4px; font-size: 13px; line-height: 22px; }
.ddb-producedLabel { grid-column: 1; color: var(--dsw-alias-label-tertiary); }
.ddb-producedLane { grid-column: 2; display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; min-width: 0; overflow: hidden; }
.ddb-producedFile {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 5px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--dsw-alias-link);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.ddb-producedIcon { flex: none; width: 1.1em; height: 1.1em; position: relative; top: 1.2px; }
.ddb-producedName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ddb-producedFile:hover, .ddb-producedFile:focus-visible { text-decoration: underline dotted; text-underline-offset: 3px; }
.ddb-producedMore { flex: 0 0 auto; white-space: nowrap; color: var(--dsw-alias-label-tertiary); }
@container (max-width: 620px) { .ddb-cards { grid-template-columns: minmax(0, 1fr); } }
@media (pointer: coarse) {
  .ddb-split, .ddb-download { min-height: 44px; }
  .ddb-open, .ddb-chevron, .ddb-download { min-width: 44px; }
}
`

    /** Install the sheet once per document; a repeat load keeps the first copy. */
    function ensureStyles() {
      if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /** Last path segment for either separator. */
    function basename(path) {
      const segments = String(path).split(/[/\\]+/).filter(segment => segment.length > 0)
      return segments.length === 0 ? String(path) : segments[segments.length - 1]
    }

    /** Stable per-delivery key: the durable coordinates, not the name. */
    function keyOf(file) {
      return `${file.seq}:${file.index}`
    }

    /**
     * The Turn's deliverables data, defensively read: a Host or client that no
     * longer publishes the shape declines the claim instead of throwing, so the
     * official row renders as it always did.
     */
    function deliverablesOf(owner) {
      const data = owner?.turn?.data
      const value = typeof data?.get === 'function' ? data.get('deliverables') : undefined
      return typeof value === 'object' && value !== null ? value : undefined
    }

    /** Changed-file paths before the closing reply, deduped in first-seen order. */
    function producedOf(data, seq) {
      const paths = []
      const seen = new Set()
      for (const entry of data?.produced ?? []) {
        if (typeof entry?.path !== 'string' || entry.seq > seq || seen.has(entry.path)) continue
        seen.add(entry.path)
        paths.push(entry.path)
      }
      return paths
    }

    /** Declared deliveries before the closing reply; a repeated path keeps its latest declaration. */
    function presentedOf(data, seq) {
      const files = new Map()
      for (const file of data?.presented ?? []) {
        if (typeof file?.path !== 'string' || !(file.seq < seq)) continue
        files.set(file.path, file)
      }
      return [...files.values()]
    }

    /**
     * Claim turns that declared deliveries; decline everything else.
     *
     * Declining is the whole compatibility story: a turn with no `present`
     * call renders through the official entry exactly as before.
     */
    function selectDelivery(owner) {
      if (owner?.turn === undefined) return null
      const data = deliverablesOf(owner)
      const presented = presentedOf(data, owner.seq)
      if (presented.length === 0) return null
      return { presented, produced: producedOf(data, owner.seq) }
    }

    /** Authenticated download URL for one declared file. */
    function downloadUrlOf(sessionId, file) {
      const params = new URLSearchParams({
        sessionId: String(sessionId),
        seq: String(file.seq),
        index: String(file.index),
      })
      return `${DOWNLOAD_PATH}?${params.toString()}`
    }

    /** Official native-open URL for one declared file. */
    function openUrlOf(sessionId, file, action) {
      const params = new URLSearchParams({
        sessionId: String(sessionId),
        seq: String(file.seq),
        index: String(file.index),
      })
      if (action === 'reveal') params.set('action', 'reveal')
      return `${OPEN_PATH}?${params.toString()}`
    }

    /**
     * Durable coordinates carried by the official per-file action URL.
     *
     * 0.1.7-rc.* hands the child slot a document-relative `api/present.open?...`
     * route whose query is exactly the (sessionId, seq, index) triple; resolve it
     * against an arbitrary origin just to reuse the URL parser, then read the
     * query. Anything else declines (returns undefined) instead of guessing.
     * @param actionUrl - official action route, absolute or document-relative.
     * @returns the durable triple, or undefined when it cannot be read.
     */
    function coordinatesOfActionUrl(actionUrl) {
      if (typeof actionUrl !== 'string' || actionUrl.length === 0) return undefined
      try {
        const params = new URL(actionUrl, 'http://localhost').searchParams
        const sessionId = params.get('sessionId')
        const seq = params.get('seq')
        const index = params.get('index')
        if (sessionId === null || sessionId === '' || seq === null || index === null) return undefined
        return { sessionId, seq, index }
      } catch {
        return undefined
      }
    }

    /**
     * Hand one same-origin URL to the browser's own download manager (streams to disk).
     * `filename` is omitted in list mode, where the Host names the file through
     * `Content-Disposition` and the official action owner exposes no path.
     */
    function saveUrl(url, filename) {
      const anchor = document.createElement('a')
      anchor.href = url
      if (filename !== undefined) anchor.download = filename
      anchor.rel = 'noopener'
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      setTimeout(() => { anchor.remove() }, 1000)
    }

    /** Status line copy for one phase, and whether it reads as a failure. */
    const PHASE_COPY = {
      checking: ['download.checking', false],
      started: ['download.started', false],
      downloadError: ['download.error', true],
      opening: ['open.opening', false],
      opened: ['open.opened', false],
      openError: ['open.error', true],
      revealing: ['reveal.opening', false],
      revealed: ['reveal.opened', false],
      revealError: ['reveal.error', true],
    }

    /** Accept only the desktop metadata fields the card renders. */
    function hostOf(value) {
      if (typeof value !== 'object' || value === null) return undefined
      if (typeof value.available !== 'boolean') return undefined
      const manager = value.fileManager
      if (manager !== null && manager !== 'finder' && manager !== 'explorer' && manager !== 'directory') return undefined
      return { available: value.available, fileManager: manager ?? null }
    }

    /** One delivery card: identity, the official sidebar/native actions, and 下载. */
    function DeliveryCard({ file, phase, host, onPreview, onNative, onDownload, t }) {
      const [menuOpen, setMenuOpen] = React.useState(false)
      const previewRef = React.useRef(null)
      const busy = phase === 'checking' || phase === 'opening' || phase === 'revealing'
      const menuDisabled = busy || host === undefined || host.available !== true
      if (menuDisabled && menuOpen) setMenuOpen(false)
      const manager = host?.fileManager ?? 'directory'
      const name = basename(file.path)
      const copy = PHASE_COPY[phase]
      const fallback = file.description?.replace(/\s*(?:\([^()]*\)|（[^（）]*）)\s*$/u, '').trim()
      const status = copy === undefined
        ? (fallback === undefined || fallback === '' ? (fileExtension(name).toUpperCase() || t('card.file')) : fallback)
        : t(copy[0])
      const act = (action) => {
        setMenuOpen(false)
        previewRef.current?.focus()
        onNative(action)
      }
      return h('div', { className: 'ddb-file', 'data-presented-file': '', 'data-download-button-file': '' },
        h('button', {
          type: 'button',
          className: 'ddb-cardPreview',
          title: file.path,
          'aria-label': t('card.previewCard', { name: file.path }),
          onClick: onPreview,
        }),
        h('span', { className: 'ddb-fileIcon' }, h(FileTypeIcon, { path: file.path, size: 20 })),
        h('div', { className: 'ddb-fileBody' },
          h('div', { className: 'ddb-details' },
            h('span', { className: 'ddb-fileName' }, name),
            h('span', {
              className: 'ddb-description',
              role: copy === undefined ? undefined : 'status',
              'data-error': copy !== undefined && copy[1] ? true : undefined,
            },
              h('span', { className: 'ddb-secondaryText' }, status),
              h('span', { className: 'ddb-previewHint' }, t('card.preview')))),
          h('div', { className: 'ddb-actions' },
            h('div', { className: 'ddb-split' },
              h('button', {
                ref: previewRef,
                type: 'button',
                className: 'ddb-open',
                'aria-label': t('card.openButton', { name: file.path }),
                onClick: onPreview,
              }, t('card.open')),
              h(Menu, {
                open: menuOpen && !menuDisabled,
                autoFocus: true,
                portal: true,
                align: 'end',
                onClose: () => { setMenuOpen(false) },
                anchor: h('button', {
                  type: 'button',
                  className: 'ddb-chevron',
                  disabled: menuDisabled,
                  'aria-haspopup': 'menu',
                  'aria-expanded': menuOpen && !menuDisabled,
                  'aria-label': t('card.more', { name: file.path }),
                  onClick: () => { setMenuOpen(value => !value) },
                }, h(IconChevronDown, { size: 11 })),
                items: [
                  { id: 'open', icon: h(IconRightUp, { size: 16, className: 'ddb-menuIcon' }), label: t('card.defaultApp') },
                  { id: 'reveal', icon: h(IconFolderOpen, { size: 16 }), label: t(manager === 'finder' ? 'card.finder' : manager === 'explorer' ? 'card.explorer' : 'card.directory') },
                ],
                onSelect: (id) => { act(id === 'reveal' ? 'reveal' : 'open') },
              })),
            h('button', {
              type: 'button',
              className: 'ddb-download',
              disabled: phase === 'checking',
              'aria-label': t('download.aria', { name: file.path }),
              title: t('download.aria', { name: file.path }),
              onClick: onDownload,
            },
              h(IconDownload, { size: 14, className: 'ddb-downloadIcon' }),
              h('span', { className: 'ddb-downloadLabel' }, t('download.action'))))))
    }

    /** The turn's changed-file chips, shown above the cards this plugin owns. */
    function ProducedRow({ paths, openFile, t }) {
      const shown = paths.slice(0, PRODUCED_CHIPS)
      const remainder = paths.length - shown.length
      return h('div', { className: 'ddb-produced' },
        h('span', { className: 'ddb-producedLabel' }, t('produced.label')),
        h('div', { className: 'ddb-producedLane' },
          shown.map(path => h('button', {
            key: path,
            type: 'button',
            className: 'ddb-producedFile',
            title: path,
            'aria-label': t('produced.open', { name: path }),
            onClick: () => { openFile(path) },
          },
            h(LinkIcon, { kind: classifyLinkPath(path), className: 'ddb-producedIcon' }),
            h('span', { className: 'ddb-producedName' }, basename(path)))),
          remainder <= 0 ? null : h('span', { className: 'ddb-producedMore' },
            remainder === 1 ? t('produced.moreOne') : t('produced.more', { count: String(remainder) }))))
    }

    /** The claimed turn tail: changed files plus delivery cards carrying 下载. */
    function DeliveryRow(props) {
      const { matched, openFile, sessionId, t } = props
      const [expanded, setExpanded] = React.useState(false)
      const [phases, setPhases] = React.useState({})
      const [hostState, setHostState] = React.useState({ status: 'loading' })
      const [hostAttempt, setHostAttempt] = React.useState(0)
      const timers = React.useRef({})
      const deliveries = matched.presented

      React.useEffect(() => {
        let cancelled = false
        setHostState({ status: 'loading' })
        fetch(HOST_PATH, { headers: { accept: 'application/json' } })
          .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
          .then(value => {
            const host = hostOf(value)
            if (cancelled) return
            setHostState(host === undefined ? { status: 'error' } : { status: 'ready', host })
          })
          .catch(() => { if (!cancelled) setHostState({ status: 'error' }) })
        return () => { cancelled = true }
      }, [hostAttempt])

      React.useEffect(() => () => {
        for (const timer of Object.values(timers.current)) clearTimeout(timer)
        timers.current = {}
      }, [])

      const settle = (key, phase) => {
        clearTimeout(timers.current[key])
        setPhases(previous => ({ ...previous, [key]: phase }))
        if (phase === 'started' || phase === 'opened' || phase === 'revealed') {
          timers.current[key] = setTimeout(() => {
            setPhases(previous => {
              const next = { ...previous }
              delete next[key]
              return next
            })
          }, STATUS_MS)
        }
      }

      const startDownload = async (file) => {
        const key = keyOf(file)
        settle(key, 'checking')
        const url = downloadUrlOf(sessionId, file)
        try {
          const response = await fetch(url, { method: 'HEAD' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          saveUrl(url, basename(file.path))
          settle(key, 'started')
        } catch {
          settle(key, 'downloadError')
        }
      }

      const startNative = async (file, action) => {
        const key = keyOf(file)
        settle(key, action === 'reveal' ? 'revealing' : 'opening')
        try {
          const response = await fetch(openUrlOf(sessionId, file, action), { method: 'POST' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          settle(key, action === 'reveal' ? 'revealed' : 'opened')
        } catch {
          settle(key, action === 'reveal' ? 'revealError' : 'openError')
        }
      }

      const collapsible = deliveries.length > COLLAPSED_DELIVERIES
      const visible = collapsible && !expanded ? deliveries.slice(0, COLLAPSED_DELIVERIES) : deliveries
      const host = hostState.status === 'ready' ? hostState.host : undefined

      return h(React.Fragment, null,
        matched.produced.length === 0
          ? null
          : h(ProducedRow, { paths: matched.produced, openFile, t }),
        h('div', {
          className: 'ddb-root',
          'data-after-produced-files': matched.produced.length > 0 ? true : undefined,
        },
          hostState.status === 'error'
            ? h('div', { className: 'ddb-status', 'data-error': true },
              h('span', null, t('host.error')),
              h('button', {
                type: 'button',
                className: 'ddb-retry',
                onClick: () => { setHostAttempt(value => value + 1) },
              }, t('host.retry')))
            : null,
          hostState.status === 'ready' && host.available !== true
            ? h('span', { className: 'ddb-status' }, t('host.unavailable'))
            : null,
          h('div', {
            className: 'ddb-cards',
            'data-presented-files-row': '',
            'data-single': deliveries.length === 1 ? true : undefined,
          },
            visible.map(file => h(DeliveryCard, {
              key: keyOf(file),
              file,
              phase: phases[keyOf(file)],
              host,
              t,
              onPreview: () => { openFile(file.path) },
              onNative: (action) => { void startNative(file, action) },
              onDownload: () => { void startDownload(file) },
            }))),
          collapsible
            ? h('button', {
              type: 'button',
              className: 'ddb-toggle',
              'aria-expanded': expanded,
              'aria-label': t(expanded ? 'card.collapseAria' : 'card.expandAria', { count: String(deliveries.length) }),
              onClick: () => { setExpanded(value => !value) },
            },
              h('span', null, expanded ? t('card.collapse') : t('card.all', { count: String(deliveries.length) })),
              expanded ? h(IconChevronUp, { size: 14 }) : h(IconChevronDown, { size: 14 }))
            : null))
    }

    /**
     * The 0.1.7-rc.* contribution: the official delivery card renders a list slot
     * per file and hands it the authorized open route, whose query is the durable
     * (sessionId, seq, index) triple. Download addresses those same coordinates —
     * never a path — so the button needs nothing but that URL.
     * @param props - child-slot owner (action route) plus the locale seat.
     * @returns the download button, or null when the route carries no coordinates.
     */
    function ActionDownload(props) {
      const { actionUrl, t } = props
      const [phase, setPhase] = React.useState(undefined)
      const timer = React.useRef(undefined)
      React.useEffect(() => () => clearTimeout(timer.current), [])
      const coordinates = coordinatesOfActionUrl(actionUrl)
      if (coordinates === undefined) return null
      const start = () => {
        clearTimeout(timer.current)
        setPhase('checking')
        const url = downloadUrlOf(coordinates.sessionId, { seq: coordinates.seq, index: coordinates.index })
        fetch(url, { method: 'HEAD' })
          .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            saveUrl(url)
            setPhase('started')
            timer.current = setTimeout(() => { setPhase(undefined) }, STATUS_MS)
          })
          .catch(() => { setPhase('downloadError') })
      }
      const copy = PHASE_COPY[phase]
      return h('button', {
        type: 'button',
        className: 'ddb-download ddb-downloadAction',
        disabled: phase === 'checking',
        'aria-label': t('download.action'),
        title: t('download.action'),
        onClick: start,
      },
        h(IconDownload, { size: 14, className: 'ddb-downloadIcon' }),
        h('span', { className: 'ddb-downloadLabel' },
          copy === undefined ? t('download.action') : t(copy[0])))
    }

    /**
     * Cardinality the running line declares for one slot, read off the registry's live
     * declaration tree.
     *
     * `slots.snapshot()` is the registry's public declaration accessor on every supported
     * RC line (0.1.5-rc.1 onward) and returns the JSON-safe topology, so this bundle asks
     * what the line declares instead of matching registration-error text. Child slots
     * (the official card's per-file action list) sit under their owner's node.
     * @param ctx - client root context.
     * @param key - exact SlotMap key.
     * @returns the declared kind, or undefined while the key is undeclared.
     */
    function declaredKind(ctx, key) {
      const walk = nodes => {
        for (const node of nodes ?? []) {
          if (node?.name === key) return node.kind
          const nested = walk(node?.children)
          if (nested !== undefined) return nested
        }
        return undefined
      }
      return walk(typeof ctx.slots.snapshot === 'function' ? ctx.slots.snapshot() : [])
    }

    /**
     * One slot contract, end to end: whether the running line declares it, and how this
     * plugin composes through it. `accepts` only reads declarations, so selection stays
     * synchronous, side-effect free and never driven by an exception.
     */
    const fileActionsAdapter = {
      id: 'deliverables.file.actions',
      accepts: ctx => declaredKind(ctx, 'deliverables.file.actions') === 'list',
      register: ctx => ctx.slots.register({
        name: 'deliverables.file.actions',
        id: 'dsh-save-button',
        locale: NS,
      }, ActionDownload),
    }

    const chainAdapter = {
      id: 'conversation.chat.turnTail',
      accepts: ctx => declaredKind(ctx, 'conversation.chat.turnTail') === 'chain',
      register: ctx => ctx.slots.register({
        name: 'conversation.chat.turnTail',
        priority: -1,
        select: selectDelivery,
        locale: NS,
      }, DeliveryRow),
    }

    /**
     * Adapters in preference order. 0.1.7-rc.* declares both the list turn tail and the
     * official card's child list, and only the child list leaves the official row
     * untouched, so it wins; 0.1.5-rc.* declares the chain turn tail only.
     */
    const ADAPTERS = [fileActionsAdapter, chainAdapter]

    /**
     * Pick the adapter that matches what the running line declares.
     * @param ctx - client root context.
     * @returns the first accepting adapter, or undefined when none fits.
     */
    function selectAdapter(ctx) {
      return ADAPTERS.find(adapter => adapter.accepts(ctx))
    }

    /** Client services: the slot registry and the locale dictionaries. */
    const inject = ['slots', 'locale']

    /**
     * Register the dictionaries, then compose through whichever slot contract this DSH
     * line declares. Selection runs inside the injections because `slots.inject` fires
     * only once its slot is declared — the declarations this probe reads exist by then,
     * whatever order the official owners activated in. A line declaring neither contract
     * leaves this plugin inert instead of throwing.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ensureStyles()
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-save-button: dictionaries')
      let installed = false
      const install = () => {
        if (installed) return
        const adapter = selectAdapter(ctx)
        if (adapter === undefined) return
        installed = true
        adapter.register(ctx)
      }
      for (const adapter of ADAPTERS) ctx.slots.inject(adapter.id, install)
    }

    exports.apply = apply
    exports.inject = inject
    exports.resolveIcons = resolveIcons
    exports.ICON_GENERATIONS = ICON_GENERATIONS
    exports.declaredKind = declaredKind
    exports.selectAdapter = selectAdapter
    exports.adapters = ADAPTERS
    exports.selectDelivery = selectDelivery
    exports.DeliveryRow = DeliveryRow
    exports.ActionDownload = ActionDownload
    exports.coordinatesOfActionUrl = coordinatesOfActionUrl
    return module.exports
  },
})
