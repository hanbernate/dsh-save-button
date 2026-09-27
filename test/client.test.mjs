/**
 * Main-flow tests for the client half.
 *
 * The plugin's main flow is exercised with the LATEST RC adapter — the 0.1.7-rc.*
 * additive per-file action list — so the flow is validated against the contract the
 * plugin targets first. Contract-specific behaviour of the older 0.1.5-rc.* chain
 * adapter lives in adapter-chain-015.test.mjs, and the per-adapter registration details
 * in adapter-file-actions-017.test.mjs.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  bundle,
  client017,
  contextFor,
  declarations017,
  installDoubles,
  translate,
} from './client-harness.mjs'

const client = client017

describe('bundle envelope', () => {
  it('registers exactly one module under the package name', () => {
    assert.equal(bundle.id, 'dsh-save-button')
    assert.equal(typeof bundle.factory, 'function')
  })

  it('exports the plugin face, both adapters and the selector', () => {
    assert.equal(typeof client.apply, 'function')
    assert.deepEqual(client.inject, ['slots', 'locale'])
    assert.deepEqual(client.adapters.map(adapter => adapter.id), [
      'deliverables.file.actions',
      'conversation.chat.turnTail',
    ])
    assert.equal(typeof client.selectAdapter, 'function')
    assert.equal(typeof client.declaredKind, 'function')
    assert.equal(typeof client.resolveIcons, 'function')
    assert.equal(typeof client.selectDelivery, 'function')
    assert.equal(typeof client.DeliveryRow, 'function')
    assert.equal(typeof client.ActionDownload, 'function')
    assert.equal(typeof client.coordinatesOfActionUrl, 'function')
  })
})

describe('apply on the 0.1.7-rc.* contract', () => {
  it('registers the zh/en dictionaries and composes through the action-list adapter', () => {
    const { ctx, dictionaries, registrations, injections } = contextFor(declarations017)
    client.apply(ctx)
    assert.deepEqual(dictionaries.map(([ns]) => ns), ['downloadButton'])
    assert.deepEqual(Object.keys(dictionaries[0][1]).sort(), ['en', 'zh'])
    assert.equal(dictionaries[0][1].zh['download.action'], '下载')
    assert.deepEqual(
      Object.keys(dictionaries[0][1].zh).sort(),
      Object.keys(dictionaries[0][1].en).sort(),
      'both dictionaries cover the same keys',
    )
    // Every adapter watches its own slot, but only the accepting one registers.
    assert.deepEqual(injections, ['deliverables.file.actions', 'conversation.chat.turnTail'])
    assert.deepEqual(registrations.map(entry => entry.options.name), ['deliverables.file.actions'])
    assert.equal(registrations[0].options.id, 'dsh-save-button')
    assert.equal(registrations[0].options.locale, 'downloadButton')
    assert.equal(typeof registrations[0].component, 'function')
  })

  it('stays inert, without throwing, when the line declares neither contract', () => {
    const { ctx, registrations } = contextFor([{ name: 'some.other.slot', kind: 'list', scope: 'root', children: [] }])
    assert.doesNotThrow(() => client.apply(ctx))
    assert.deepEqual(registrations, [])
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

describe('the 0.1.7-rc.* download action', () => {
  let doubles

  before(() => { doubles = installDoubles() })
  after(() => { doubles.restore() })

  it('renders the button and downloads through HEAD + an anchor named by the response', async () => {
    doubles.fetches.length = 0
    doubles.documentStub.anchors.length = 0
    const button = client.ActionDownload({
      actionUrl: 'api/present.open?sessionId=s9&seq=12&index=3',
      t: translate,
    })
    assert.equal(button.props.className, 'ddb-download ddb-downloadAction')
    button.props.onClick()
    await new Promise(resolve => { setTimeout(resolve, 0) })
    assert.deepEqual(doubles.fetches, [['/api/download.button?sessionId=s9&seq=12&index=3', 'HEAD']])
    assert.equal(doubles.documentStub.anchors.length, 1)
    assert.equal(doubles.documentStub.anchors[0].clicked, 1)
    assert.equal(
      doubles.documentStub.anchors[0].download,
      undefined,
      'Content-Disposition names the file in list mode',
    )
  })

  it('renders nothing when the official action URL carries no usable coordinates', () => {
    assert.equal(client.ActionDownload({ actionUrl: 'api/present.host', t: translate }), null)
    assert.equal(client.ActionDownload({ actionUrl: undefined, t: translate }), null)
    assert.equal(client.ActionDownload({ actionUrl: 'api/present.open?index=0', t: translate }), null)
  })

  it('reads the durable coordinates out of the official action URL', () => {
    assert.equal(client.coordinatesOfActionUrl('api/present.open?a=b'), undefined)
    assert.equal(client.coordinatesOfActionUrl(''), undefined)
    assert.deepEqual(
      client.coordinatesOfActionUrl('https://host/x/api/present.open?sessionId=s&seq=007&index=0'),
      { sessionId: 's', seq: '007', index: '0' },
    )
  })

  it('reports the failed pre-check, and starts no download, when HEAD is refused', async () => {
    doubles.fetches.length = 0
    doubles.documentStub.anchors.length = 0
    doubles.state.respond = () => ({ ok: false, status: 404, json: () => Promise.resolve({}) })
    const button = client.ActionDownload({
      actionUrl: 'api/present.open?sessionId=s9&seq=12&index=3',
      t: translate,
    })
    button.props.onClick()
    await new Promise(resolve => { setTimeout(resolve, 0) })
    doubles.state.respond = () => ({ ok: true, status: 200, json: () => Promise.resolve({}) })
    assert.deepEqual(doubles.fetches, [['/api/download.button?sessionId=s9&seq=12&index=3', 'HEAD']])
    assert.equal(doubles.documentStub.anchors.length, 0, 'a refused pre-check must not start a download')
  })
})
