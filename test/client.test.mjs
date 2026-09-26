/**
 * Browser-half tests without a browser: the bundle is loaded through a stubbed
 * `window.__ModuleLoader__`, materialized with stubbed `react` and
 * ui-primitives, then driven through the plugin's own entry points.
 *
 * These catch the failures that matter for a hand-written bundle — a wrong
 * module id, a missing export, a claim that swallows the official row, and a
 * download button that never fires the route.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

/** Element factories the component reaches for, recording what the test can assert. */
function createDocumentStub() {
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
const reactStub = {
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

/** Symbolic stand-ins for the shared primitives the bundle requires. */
const primitivesStub = {
  Menu: 'Menu',
  FileTypeIcon: 'FileTypeIcon',
  LinkIcon: 'LinkIcon',
  classifyLinkPath: () => 'file',
  fileExtension: name => (name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''),
  IconChevronDownOutline14: 'IconChevronDownOutline14',
  IconChevronUpOutline14: 'IconChevronUpOutline14',
  IconRightUpOutline16: 'IconRightUpOutline16',
  IconFolderOpenOutline16: 'IconFolderOpenOutline16',
  IconDownloadOutline16: 'IconDownloadOutline16',
}

/** The bundle's registered factory, captured from the stubbed loader. */
const loaded = []
globalThis.window = { __ModuleLoader__: { load: registration => loaded.push(registration) } }
await import('../lib/client.js')

const bundle = loaded[0]

/** Materialize the client half against the stubs. */
function materialize() {
  return bundle.factory(specifier => {
    if (specifier === 'react') return reactStub
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
    throw new Error(`unexpected module request: ${specifier}`)
  })
}

const client = materialize()

describe('bundle envelope', () => {
  it('registers exactly one module under the package name', () => {
    assert.equal(loaded.length, 1, 'the bundle registers exactly one module')
    assert.equal(bundle.id, 'dsh-present-download')
    assert.equal(typeof bundle.factory, 'function')
  })

  it('exports the client plugin shape', () => {
    assert.equal(typeof client.apply, 'function')
    assert.deepEqual(client.inject, ['slots', 'locale'])
    assert.equal(typeof client.selectDelivery, 'function')
  })
})

describe('selectDelivery', () => {
  const ownerOf = (deliverables, seq = 100) => ({
    turn: { data: new Map(deliverables === undefined ? [] : [['deliverables', deliverables]]) },
    seq,
    openFile: () => {},
  })

  it('claims a turn that declared deliveries and keeps every declared field', () => {
    const matched = client.selectDelivery(ownerOf({
      produced: [],
      presented: [{ path: 'build/app.zip', description: 'release', seq: 4, index: 0 }],
    }))
    assert.deepEqual(matched, {
      presented: [{ path: 'build/app.zip', description: 'release', seq: 4, index: 0 }],
      produced: [],
    })
  })

  it('declines a turn with no delivery so the official row still renders', () => {
    assert.equal(client.selectDelivery(ownerOf({ produced: [{ seq: 2, path: 'src/a.ts' }] })), null)
    assert.equal(client.selectDelivery(ownerOf({ produced: [], presented: [] })), null)
    assert.equal(client.selectDelivery(ownerOf(undefined)), null)
    assert.equal(client.selectDelivery({ turn: {}, seq: 1, openFile: () => {} }), null)
  })

  it('ignores deliveries declared at or after the closing reply', () => {
    assert.equal(client.selectDelivery(ownerOf({
      produced: [],
      presented: [{ path: 'late.zip', seq: 100, index: 0 }],
    }, 100)), null)
  })

  it('keeps the latest declaration of a repeated path, in first-seen order', () => {
    const matched = client.selectDelivery(ownerOf({
      produced: [],
      presented: [
        { path: 'a.zip', description: 'first', seq: 3, index: 0 },
        { path: 'b.zip', seq: 4, index: 0 },
        { path: 'a.zip', description: 'latest', seq: 5, index: 1 },
      ],
    }))
    assert.deepEqual(matched.presented.map(file => [file.path, file.description]), [
      ['a.zip', 'latest'],
      ['b.zip', undefined],
    ])
  })

  it('carries the turn changed files alongside the deliveries, deduped', () => {
    const matched = client.selectDelivery(ownerOf({
      produced: [{ seq: 1, path: 'src/a.ts' }, { seq: 2, path: 'src/a.ts' }, { seq: 3, path: 'src/b.ts' }],
      presented: [{ path: 'out.zip', seq: 4, index: 0 }],
    }))
    assert.deepEqual(matched.produced, ['src/a.ts', 'src/b.ts'])
  })
})

describe('apply', () => {
  it('registers dictionaries and a turn-tail chain entry that runs before the official one', () => {
    const dictionaries = []
    const registrations = []
    const ctx = {
      effect: (callback) => { callback() },
      locale: { register: (ns, dict) => { dictionaries.push([ns, dict]) } },
      slots: {
        inject: (key, callback) => callback(),
        register: (options, component) => { registrations.push({ options, component }) },
      },
    }
    client.apply(ctx)
    assert.deepEqual(dictionaries.map(([ns]) => ns), ['presentDownload'])
    assert.deepEqual(Object.keys(dictionaries[0][1]).sort(), ['en', 'zh'])
    assert.equal(dictionaries[0][1].zh['download.action'], '下载')
    assert.deepEqual(Object.keys(dictionaries[0][1].zh).sort(), Object.keys(dictionaries[0][1].en).sort())
    assert.equal(registrations.length, 1)
    const { options } = registrations[0]
    assert.equal(options.name, 'conversation.chat.turnTail')
    assert.equal(options.priority, -1, 'a lower priority wins the chain before the official entry')
    assert.equal(options.locale, 'presentDownload')
    assert.equal(typeof options.select, 'function')
  })
})

describe('rendered card', () => {
  /**
   * Depth-first walk that also renders function components, standing in for the
   * React commit the plugin gets in a browser. Hook stubs are inert, so a render
   * is side-effect free and every assertion reads real output.
   */
  function walk(node, visit) {
    if (Array.isArray(node)) { for (const child of node) walk(child, visit); return }
    if (node === null || node === undefined || typeof node !== 'object') return
    if (typeof node.type === 'function') { walk(node.type(node.props), visit); return }
    visit(node)
    walk(node.props?.children, visit)
  }

  /** Every stub element of one type in a tree. */
  function elementsOf(tree, type) {
    const found = []
    walk(tree, node => { if (node.type === type) found.push(node) })
    return found
  }

  /** The text content of a stub tree. */
  function textOf(tree) {
    const parts = []
    walk(tree, node => { if (typeof node.props?.children === 'string') parts.push(node.props.children) })
    return parts.join('')
  }

  let documentStub
  let fetches

  before(() => {
    documentStub = createDocumentStub()
    globalThis.document = documentStub.document
    fetches = []
    globalThis.fetch = (url, init) => {
      fetches.push([String(url), init?.method ?? 'GET'])
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
    }
  })

  after(() => {
    delete globalThis.document
    delete globalThis.fetch
    delete globalThis.window
  })

  const translate = (key, params) => {
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

  function renderRow(matched = {
    produced: [],
    presented: [{ path: 'dist/HexHowitzer-windows-x86_64.zip', description: 'release', seq: 7, index: 0 }],
  }) {
    return client.DeliveryRow({
      matched,
      openFile: () => {},
      sessionId: 'session-1',
      t: translate,
    })
  }

  it('renders 打开 and a 下载 button to its right inside the same card', () => {
    const tree = renderRow()
    const cards = elementsOf(tree, 'div').filter(node => node.props['data-presented-file'] !== undefined)
    assert.equal(cards.length, 1)
    const buttons = elementsOf(cards[0], 'button')
    const open = buttons.find(button => button.props.className === 'pdd-open')
    const download = buttons.find(button => button.props.className === 'pdd-download')
    assert.equal(textOf(open), '打开')
    assert.equal(textOf(download), '下载')
    assert.equal(download.props['aria-label'], '下载 dist/HexHowitzer-windows-x86_64.zip')
    const actions = elementsOf(cards[0], 'div').find(node => node.props.className === 'pdd-actions')
    assert.deepEqual(actions.props.children.map(child => child.props.className), ['pdd-split', 'pdd-download'])
  })

  it('addresses the download by the durable coordinates, never by path', async () => {
    fetches.length = 0
    documentStub.anchors.length = 0
    const tree = renderRow()
    const download = elementsOf(tree, 'button').find(node => node.props.className === 'pdd-download')
    download.props.onClick()
    await new Promise(resolve => { setTimeout(resolve, 0) })
    assert.deepEqual(fetches, [['/api/present.download?sessionId=session-1&seq=7&index=0', 'HEAD']])
    assert.equal(documentStub.anchors.length, 1)
    assert.equal(documentStub.anchors[0].clicked, 1)
    assert.equal(documentStub.anchors[0].download, 'HexHowitzer-windows-x86_64.zip')
  })

  it('renders the changed-file chips when the turn also wrote files', () => {
    const tree = renderRow({
      produced: ['src/a.ts', 'src/b.ts'],
      presented: [{ path: 'out.zip', seq: 3, index: 0 }],
    })
    const chips = elementsOf(tree, 'button').filter(node => node.props.className === 'pdd-producedFile')
    assert.deepEqual(chips.map(chip => chip.props.title), ['src/a.ts', 'src/b.ts'])
    assert.ok(textOf(tree).includes('本轮文件改动'))
  })

  it('collapses past four deliveries and offers the count', () => {
    const presented = Array.from({ length: 5 }, (_, index) => ({ path: `f${index}.zip`, seq: 5, index }))
    const tree = renderRow({ produced: [], presented })
    const cards = elementsOf(tree, 'div').filter(node => node.props['data-presented-file'] !== undefined)
    assert.equal(cards.length, 4)
    const toggle = elementsOf(tree, 'button').find(node => node.props.className === 'pdd-toggle')
    assert.ok(toggle !== undefined)
    assert.ok(textOf(toggle).includes('5'))
  })
})
