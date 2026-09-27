/**
 * Adapter tests for the DSH 0.1.5-rc.* contract.
 *
 * That line declares `conversation.chat.turnTail` as a CHAIN slot and has no per-file
 * action list, so the plugin claims the turn tail at `priority: -1` and renders the whole
 * row (changed-file chips + delivery cards carrying 下载) itself. Everything here is
 * specific to that adapter: its selection, its registration shape, and the row it renders.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  client015,
  contextFor,
  declarations015,
  elementsOf,
  installDoubles,
  textOf,
  translate,
} from './client-harness.mjs'

const client = client015
const chainAdapter = client.adapters.find(adapter => adapter.id === 'conversation.chat.turnTail')

describe('adapter selection on the 0.1.5-rc.* topology', () => {
  it('reads the chain declaration and picks the chain adapter', () => {
    const { ctx } = contextFor(declarations015)
    assert.equal(client.declaredKind(ctx, 'conversation.chat.turnTail'), 'chain')
    assert.equal(client.declaredKind(ctx, 'deliverables.file.actions'), undefined)
    assert.equal(client.selectAdapter(ctx), chainAdapter)
  })

  it('registers the chain claim on the turn tail, and never the action list', () => {
    const { ctx, registrations, injections } = contextFor(declarations015)
    client.apply(ctx)
    assert.deepEqual(injections, ['deliverables.file.actions', 'conversation.chat.turnTail'])
    assert.equal(registrations.length, 1)
    const { options, component } = registrations[0]
    assert.equal(options.name, 'conversation.chat.turnTail')
    assert.equal(options.priority, -1, 'a lower priority wins the chain before the official entry')
    assert.equal(options.locale, 'downloadButton')
    assert.equal(typeof options.select, 'function')
    assert.equal(component, client.DeliveryRow)
  })

  it('claims only turns that declared deliveries, so other turns render officially', () => {
    const ownerOf = deliverables => ({
      turn: { data: new Map(deliverables === undefined ? [] : [['deliverables', deliverables]]) },
      seq: 100,
      openFile: () => {},
    })
    const { options } = (() => {
      const { ctx, registrations } = contextFor(declarations015)
      client.apply(ctx)
      return registrations[0]
    })()
    assert.notEqual(options.select(ownerOf({ produced: [], presented: [{ path: 'a.zip', seq: 1, index: 0 }] })), null)
    assert.equal(options.select(ownerOf({ produced: [{ seq: 1, path: 'src/a.ts' }] })), null)
  })
})

describe('the row the 0.1.5-rc.* adapter owns', () => {
  let doubles

  before(() => { doubles = installDoubles() })
  after(() => { doubles.restore() })

  const renderRow = (matched = {
    produced: [],
    presented: [{ path: 'dist/HexHowitzer-windows-x86_64.zip', description: 'release', seq: 7, index: 0 }],
  }) => client.DeliveryRow({
    matched,
    openFile: () => {},
    sessionId: 'session-1',
    t: translate,
  })

  it('renders 打开 and a 下载 button to its right inside the same card', () => {
    const tree = renderRow()
    const cards = elementsOf(tree, 'div').filter(node => node.props['data-presented-file'] !== undefined)
    assert.equal(cards.length, 1)
    const buttons = elementsOf(cards[0], 'button')
    const open = buttons.find(button => button.props.className === 'ddb-open')
    const download = buttons.find(button => button.props.className === 'ddb-download')
    assert.equal(textOf(open), '打开')
    assert.equal(textOf(download), '下载')
    assert.equal(download.props['aria-label'], '下载 dist/HexHowitzer-windows-x86_64.zip')
    const actions = elementsOf(cards[0], 'div').find(node => node.props.className === 'ddb-actions')
    assert.deepEqual(actions.props.children.map(child => child.props.className), ['ddb-split', 'ddb-download'])
  })

  it('addresses the download by the durable coordinates, never by path, and names it', async () => {
    doubles.fetches.length = 0
    doubles.documentStub.anchors.length = 0
    const tree = renderRow()
    const download = elementsOf(tree, 'button').find(node => node.props.className === 'ddb-download')
    download.props.onClick()
    await new Promise(resolve => { setTimeout(resolve, 0) })
    assert.deepEqual(doubles.fetches, [['/api/download.button?sessionId=session-1&seq=7&index=0', 'HEAD']])
    assert.equal(doubles.documentStub.anchors.length, 1)
    assert.equal(doubles.documentStub.anchors[0].clicked, 1)
    assert.equal(doubles.documentStub.anchors[0].download, 'HexHowitzer-windows-x86_64.zip')
  })

  it('renders the changed-file chips when the turn also wrote files', () => {
    const tree = renderRow({
      produced: ['src/a.ts', 'src/b.ts'],
      presented: [{ path: 'out.zip', seq: 3, index: 0 }],
    })
    const chips = elementsOf(tree, 'button').filter(node => node.props.className === 'ddb-producedFile')
    assert.deepEqual(chips.map(chip => chip.props.title), ['src/a.ts', 'src/b.ts'])
    assert.ok(textOf(tree).includes('本轮文件改动'))
  })

  it('collapses past four deliveries and offers the count', () => {
    const presented = Array.from({ length: 5 }, (_, index) => ({ path: `f${index}.zip`, seq: 5, index }))
    const tree = renderRow({ produced: [], presented })
    const cards = elementsOf(tree, 'div').filter(node => node.props['data-presented-file'] !== undefined)
    assert.equal(cards.length, 4)
    const toggle = elementsOf(tree, 'button').find(node => node.props.className === 'ddb-toggle')
    assert.ok(toggle !== undefined)
    assert.ok(textOf(toggle).includes('5'))
  })

  it('resolves every icon on 0.1.5-rc.* primitives', () => {
    const matched = { produced: [], presented: [{ path: 'a.zip', seq: 1, index: 0 }] }
    const tree = client.DeliveryRow({ matched, openFile: () => {}, sessionId: 's', t: translate })
    assert.equal(elementsOf(tree, 'old.download').length, 1)
  })
})
