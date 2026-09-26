/**
 * dsh-present-download — browser half.
 *
 * Adds a 「下载」 button to the right of the delivery card's 打开 control, so a
 * file the model delivered with `present` (a build archive, a report, a
 * dataset) leaves the Host through the browser instead of SFTP.
 *
 * How it composes without patching official code:
 *
 * - `conversation.chat.turnTail` is a chain slot: every contributor supplies a
 *   `select`, the first non-null match renders, and ties are ordered by
 *   ascending `priority`. This plugin registers at `priority: -1` and claims a
 *   turn only when that turn has declared deliveries, so turns with no
 *   `present` call keep rendering through the official row untouched.
 * - The claimed row renders the turn's changed-file chips and the delivery
 *   cards here, because a chain renders exactly one contribution.
 * - The button downloads through `/api/present.download`, addressed by the
 *   same (sessionId, seq, index) coordinates the durable declaration carries —
 *   never by a path.
 * - The card's own 打开 / 用默认应用打开 / 打开所在文件夹 actions reuse the
 *   official `/api/present.open` and `/api/present.host` routes, so native
 *   actions stay governed by the official desktop checks.
 */
window.__ModuleLoader__.load({
  id: 'dsh-present-download',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const {
      Menu, FileTypeIcon, LinkIcon, classifyLinkPath, fileExtension,
      IconChevronDownOutline14, IconChevronUpOutline14,
      IconRightUpOutline16, IconFolderOpenOutline16, IconDownloadOutline16,
    } = require('@deepseek-ai/dsh-client-ui-primitives')

    const h = React.createElement

    /** This plugin's locale namespace and the storage key of its injected sheet. */
    const NS = 'presentDownload'
    const STYLE_ID = 'dsh-present-download/styles'

    /** Host routes: ours, plus the official file-action routes the card reuses. */
    const DOWNLOAD_PATH = '/api/present.download'
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
.pdd-root {
  --pdd-fill: var(--dsw-static-neutral-50);
  --pdd-hover: var(--dsw-static-neutral-100);
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  margin-top: 4px;
}
body[data-ds-dark-theme] .pdd-root {
  --pdd-fill: var(--dsw-static-neutral-850);
  --pdd-hover: var(--dsw-static-neutral-800);
}
.pdd-root[data-after-produced-files='true'] { margin-top: 0; }
.pdd-status { display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.pdd-status[data-error='true'] { color: var(--dsw-alias-state-error-primary); }
.pdd-retry {
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
.pdd-retry:hover { background: var(--dsw-alias-interactive-bg-hover); }
.pdd-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; min-width: 0; }
.pdd-cards[data-single='true'] { grid-template-columns: minmax(0, 1fr); }
.pdd-file {
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
  background: var(--pdd-fill);
  color: var(--dsw-alias-label-primary);
  transition: background-color 120ms ease;
}
.pdd-file:hover { background: var(--pdd-hover); }
.pdd-cardPreview {
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
.pdd-cardPreview:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--dsw-alias-brand-primary); }
.pdd-fileIcon {
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
  background: var(--pdd-fill);
  color: var(--dsw-alias-link);
}
.pdd-fileBody {
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
.pdd-details { display: flex; flex: 1; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; }
.pdd-fileName { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; line-height: 20px; }
.pdd-description { overflow: hidden; color: var(--dsw-alias-label-tertiary); font-size: 10px; font-weight: 400; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }
.pdd-description[data-error='true'] { color: var(--dsw-alias-state-error-primary); }
.pdd-previewHint { display: none; }
.pdd-file:hover .pdd-secondaryText { display: none; }
.pdd-file:hover .pdd-previewHint { display: inline; }
.pdd-actions { display: inline-flex; flex: none; align-items: stretch; gap: 6px; pointer-events: auto; }
.pdd-split {
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
.pdd-open, .pdd-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: none;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  font-family: var(--dsw-font-family);
}
.pdd-open { padding: 4px 8px; font-size: 12px; line-height: 18px; }
.pdd-chevron { padding: 4px 5px; border-left: 0.5px solid var(--dsw-alias-border-l3); color: var(--dsw-alias-label-secondary); }
.pdd-open:hover, .pdd-open:focus-visible, .pdd-chevron:hover:not(:disabled), .pdd-chevron:focus-visible { background: var(--dsw-alias-interactive-bg-hover); }
.pdd-chevron:disabled { color: var(--dsw-alias-label-dimmed); cursor: not-allowed; }
.pdd-menuIcon { display: block; width: 16px; height: 16px; }
.pdd-download {
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
.pdd-download:hover:not(:disabled), .pdd-download:focus-visible { background: var(--dsw-alias-interactive-bg-hover); }
.pdd-download:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--dsw-alias-brand-primary); }
.pdd-download:disabled { color: var(--dsw-alias-label-dimmed); cursor: progress; }
.pdd-downloadIcon { display: block; flex: none; width: 14px; height: 14px; }
.pdd-toggle {
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
.pdd-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); }
.pdd-toggle svg { flex: none; width: 14px; height: 14px; }
.pdd-produced { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: start; column-gap: 8px; margin-top: 4px; font-size: 13px; line-height: 22px; }
.pdd-producedLabel { grid-column: 1; color: var(--dsw-alias-label-tertiary); }
.pdd-producedLane { grid-column: 2; display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; min-width: 0; overflow: hidden; }
.pdd-producedFile {
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
.pdd-producedIcon { flex: none; width: 1.1em; height: 1.1em; position: relative; top: 1.2px; }
.pdd-producedName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pdd-producedFile:hover, .pdd-producedFile:focus-visible { text-decoration: underline dotted; text-underline-offset: 3px; }
.pdd-producedMore { flex: 0 0 auto; white-space: nowrap; color: var(--dsw-alias-label-tertiary); }
@container (max-width: 620px) { .pdd-cards { grid-template-columns: minmax(0, 1fr); } }
@media (pointer: coarse) {
  .pdd-split, .pdd-download { min-height: 44px; }
  .pdd-open, .pdd-chevron, .pdd-download { min-width: 44px; }
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

    /** Hand one same-origin URL to the browser's own download manager (streams to disk). */
    function saveUrl(url, filename) {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
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
      return h('div', { className: 'pdd-file', 'data-presented-file': '', 'data-present-download-file': '' },
        h('button', {
          type: 'button',
          className: 'pdd-cardPreview',
          title: file.path,
          'aria-label': t('card.previewCard', { name: file.path }),
          onClick: onPreview,
        }),
        h('span', { className: 'pdd-fileIcon' }, h(FileTypeIcon, { path: file.path, size: 20 })),
        h('div', { className: 'pdd-fileBody' },
          h('div', { className: 'pdd-details' },
            h('span', { className: 'pdd-fileName' }, name),
            h('span', {
              className: 'pdd-description',
              role: copy === undefined ? undefined : 'status',
              'data-error': copy !== undefined && copy[1] ? true : undefined,
            },
              h('span', { className: 'pdd-secondaryText' }, status),
              h('span', { className: 'pdd-previewHint' }, t('card.preview')))),
          h('div', { className: 'pdd-actions' },
            h('div', { className: 'pdd-split' },
              h('button', {
                ref: previewRef,
                type: 'button',
                className: 'pdd-open',
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
                  className: 'pdd-chevron',
                  disabled: menuDisabled,
                  'aria-haspopup': 'menu',
                  'aria-expanded': menuOpen && !menuDisabled,
                  'aria-label': t('card.more', { name: file.path }),
                  onClick: () => { setMenuOpen(value => !value) },
                }, h(IconChevronDownOutline14, { size: 11 })),
                items: [
                  { id: 'open', icon: h(IconRightUpOutline16, { size: 16, className: 'pdd-menuIcon' }), label: t('card.defaultApp') },
                  { id: 'reveal', icon: h(IconFolderOpenOutline16, { size: 16 }), label: t(manager === 'finder' ? 'card.finder' : manager === 'explorer' ? 'card.explorer' : 'card.directory') },
                ],
                onSelect: (id) => { act(id === 'reveal' ? 'reveal' : 'open') },
              })),
            h('button', {
              type: 'button',
              className: 'pdd-download',
              disabled: phase === 'checking',
              'aria-label': t('download.aria', { name: file.path }),
              title: t('download.aria', { name: file.path }),
              onClick: onDownload,
            },
              h(IconDownloadOutline16, { size: 14, className: 'pdd-downloadIcon' }),
              h('span', { className: 'pdd-downloadLabel' }, t('download.action'))))))
    }

    /** The turn's changed-file chips, shown above the cards this plugin owns. */
    function ProducedRow({ paths, openFile, t }) {
      const shown = paths.slice(0, PRODUCED_CHIPS)
      const remainder = paths.length - shown.length
      return h('div', { className: 'pdd-produced' },
        h('span', { className: 'pdd-producedLabel' }, t('produced.label')),
        h('div', { className: 'pdd-producedLane' },
          shown.map(path => h('button', {
            key: path,
            type: 'button',
            className: 'pdd-producedFile',
            title: path,
            'aria-label': t('produced.open', { name: path }),
            onClick: () => { openFile(path) },
          },
            h(LinkIcon, { kind: classifyLinkPath(path), className: 'pdd-producedIcon' }),
            h('span', { className: 'pdd-producedName' }, basename(path)))),
          remainder <= 0 ? null : h('span', { className: 'pdd-producedMore' },
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
          className: 'pdd-root',
          'data-after-produced-files': matched.produced.length > 0 ? true : undefined,
        },
          hostState.status === 'error'
            ? h('div', { className: 'pdd-status', 'data-error': true },
              h('span', null, t('host.error')),
              h('button', {
                type: 'button',
                className: 'pdd-retry',
                onClick: () => { setHostAttempt(value => value + 1) },
              }, t('host.retry')))
            : null,
          hostState.status === 'ready' && host.available !== true
            ? h('span', { className: 'pdd-status' }, t('host.unavailable'))
            : null,
          h('div', {
            className: 'pdd-cards',
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
              className: 'pdd-toggle',
              'aria-expanded': expanded,
              'aria-label': t(expanded ? 'card.collapseAria' : 'card.expandAria', { count: String(deliveries.length) }),
              onClick: () => { setExpanded(value => !value) },
            },
              h('span', null, expanded ? t('card.collapse') : t('card.all', { count: String(deliveries.length) })),
              expanded ? h(IconChevronUpOutline14, { size: 14 }) : h(IconChevronDownOutline14, { size: 14 }))
            : null))
    }

    /** Client services: the slot registry and the locale dictionaries. */
    const inject = ['slots', 'locale']

    /**
     * Register the dictionaries and the turn-tail contribution.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ensureStyles()
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-present-download: dictionaries')
      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail',
        priority: -1,
        select: selectDelivery,
        locale: NS,
      }, DeliveryRow))
    }

    exports.apply = apply
    exports.inject = inject
    exports.selectDelivery = selectDelivery
    exports.DeliveryRow = DeliveryRow
    return module.exports
  },
})
