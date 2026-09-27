/**
 * Shared browser-free harness for the client half.
 *
 * The hand-written bundle is loaded through a stubbed `window.__ModuleLoader__`, then
 * materialized against a chosen ui-primitives surface — so each adapter test can describe
 * one DSH RC line (its exports, its slot declarations) without a browser.
 */
/** Element factories the component reaches for, recording what a test can assert. */
export function createDocumentStub() {
  const anchors = []
  const appendedStyles = []
  const document = {
    head: { appendChild: element => appendedStyles.push(element) },
    body: { appendChild: element => { if (element.tag === 'a') anchors.push(element) } },
    getElementById: () => null,
    createElement: (tag) => {
      const element = {
        tag,
        style: {},
        clicked: 0,
        removed: 0,
        click() { this.clicked += 1 },
        remove() { this.removed += 1 },
      }
      return element
    },
  }
  return { document, anchors, appendedStyles }
}

/** Minimal React: element trees as plain objects, hooks as inert stubs. */
export const reactStub = {
  createElement: (type, props, ...children) => ({
    type,
    props: {
      ...(props ?? {}),
      ...children.length === 0 ? {} : { children: children.length === 1 ? children[0] : children },
    },
  }),
  Fragment: Symbol.for('react.fragment'),
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: value => ({ current: value }),
}

/** Symbolic stand-ins for the primitives every RC line exports. */
export const primitivesBase = {
  Menu: 'Menu',
  FileTypeIcon: 'FileTypeIcon',
  LinkIcon: 'LinkIcon',
  classifyLinkPath: () => 'file',
  fileExtension: name => (name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''),
}

/** DSH 0.1.5-rc.* primitives: size-suffixed icon names (the chevrons used `…14`). */
export const primitives015 = {
  ...primitivesBase,
  IconChevronDownOutline14: 'old.chevronDown',
  IconChevronUpOutline14: 'old.chevronUp',
  IconRightUpOutline16: 'old.rightUp',
  IconFolderOpenOutline16: 'old.folderOpen',
  IconDownloadOutline16: 'old.download',
}

/**
 * DSH 0.1.7-rc.* primitives: WEIGHT-suffixed icon names, old ones removed. Taken from the
 * real build (`lib/types/icons/index.d.ts` exports `…OutlineRegular` / `…OutlineMedium`);
 * stubbing a bare `IconDownloadOutline` here would hide the break these tests exist for.
 */
export const primitives017 = {
  ...primitivesBase,
  IconChevronDownOutlineRegular: 'new.chevronDown',
  IconChevronUpOutlineRegular: 'new.chevronUp',
  IconRightUpOutlineRegular: 'new.rightUp',
  IconFolderOpenOutlineRegular: 'new.folderOpen',
  IconDownloadOutlineRegular: 'new.download',
}

/** No released line exports bare names: covers the defensive last-resort term. */
export const primitivesBare = {
  ...primitivesBase,
  IconChevronDownOutline: 'bare.chevronDown',
  IconChevronUpOutline: 'bare.chevronUp',
  IconRightUpOutline: 'bare.rightUp',
  IconFolderOpenOutline: 'bare.folderOpen',
  IconDownloadOutline: 'bare.download',
}

/** The bundle's registered factory, captured from the stubbed loader. */
const loaded = []
globalThis.window = { __ModuleLoader__: { load: registration => loaded.push(registration) } }
await import('../lib/client.js')

export const bundle = loaded[0]

/**
 * Materialize the client half against one primitives build.
 * @param primitives - the ui-primitives surface to inject.
 * @returns the plugin module's exports.
 */
export function materialize(primitives = primitives017) {
  return bundle.factory(specifier => {
    if (specifier === 'react') return reactStub
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`unexpected module request: ${specifier}`)
  })
}

/** The 0.1.7-rc.* materialization this plugin targets first. */
export const client017 = materialize(primitives017)
/** The 0.1.5-rc.* materialization. */
export const client015 = materialize(primitives015)
/** The bare-name materialization no released line needs, kept for the last-resort term. */
export const clientBare = materialize(primitivesBare)

/** The 0.1.5-rc.* slot topology: a chain turn tail, and no per-file action list. */
export const declarations015 = [
  { name: 'conversation.chat.turnTail', kind: 'chain', scope: 'session', children: [] },
]

/** The 0.1.7-rc.* topology: a list turn tail whose card declares the action child list. */
export const declarations017 = [
  {
    name: 'conversation.chat.turnTail',
    kind: 'list',
    scope: 'session',
    children: [
      { name: 'deliverables.file.actions', kind: 'list', scope: 'root', children: [] },
    ],
  },
]

/**
 * A client context whose slot registry exposes one declaration tree.
 * `inject` fires its callback immediately, like a registry whose slot is already declared.
 * @param declared - root declaration nodes (`{name, kind, children}`).
 */
export function contextFor(declared) {
  const dictionaries = []
  const registrations = []
  const injections = []
  const ctx = {
    effect: callback => callback(),
    locale: { register: (ns, dict) => { dictionaries.push([ns, dict]) } },
    slots: {
      snapshot: () => declared,
      inject: (key, callback) => {
        injections.push(key)
        return callback()
      },
      register: (options, component) => { registrations.push({ options, component }) },
    },
  }
  return { ctx, dictionaries, registrations, injections }
}

/** Depth-first walk that also renders function components, standing in for React's commit. */
export function walk(node, visit) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (node === null || node === undefined || typeof node !== 'object') return
  if (typeof node.type === 'function') {
    walk(node.type(node.props), visit)
    return
  }
  visit(node)
  walk(node.props?.children, visit)
}

/** Every stub element of one type in a tree. */
export function elementsOf(tree, type) {
  const found = []
  walk(tree, node => { if (node.type === type) found.push(node) })
  return found
}

/** The text content of a stub tree. */
export function textOf(tree) {
  const parts = []
  walk(tree, node => { if (typeof node.props?.children === 'string') parts.push(node.props.children) })
  return parts.join('')
}

/** The card's own copy, resolved the way the locale seat would. */
export const translate = (key, params) => {
  const template = ({
    'card.open': '打开',
    'card.preview': '在侧边栏预览',
    'card.defaultApp': '用默认应用打开',
    'card.directory': '打开所在文件夹',
    'download.action': '下载',
    'download.aria': '下载 {name}',
    'download.checking': '正在准备下载…',
    'download.started': '已开始下载',
    'download.error': '下载失败，点击重试',
    'card.all': '全部 {count} 个文件',
    'produced.label': '本轮文件改动',
  })[key]
  if (template === undefined) return key
  return template.replace(/\{(\w+)\}/g, (_match, name) => String(params?.[name] ?? ''))
}

/**
 * Install the document/fetch doubles a card or action test needs.
 * `state.respond` decides each response, so one test can force a failure.
 * Call in `before`, then `restore()` in `after`.
 */
export function installDoubles() {
  const documentStub = createDocumentStub()
  const fetches = []
  const state = { respond: () => ({ ok: true, status: 200, json: () => Promise.resolve({}) }) }
  globalThis.document = documentStub.document
  globalThis.fetch = (url, init) => {
    fetches.push([String(url), init?.method ?? 'GET'])
    return Promise.resolve(state.respond())
  }
  return {
    documentStub,
    fetches,
    state,
    restore() {
      delete globalThis.document
      delete globalThis.fetch
    },
  }
}
