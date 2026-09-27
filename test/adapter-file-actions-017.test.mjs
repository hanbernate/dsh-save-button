/**
 * Adapter tests for the DSH 0.1.7-rc.* contract.
 *
 * That line declares `conversation.chat.turnTail` as a LIST and the official delivery card
 * declares the child list `deliverables.file.actions`, so the plugin leaves the official
 * row untouched and contributes one 下载 button per delivered file through that child
 * list — addressed by the coordinates the official action URL carries.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  client017,
  contextFor,
  declarations015,
  declarations017,
  elementsOf,
  installDoubles,
  translate,
} from './client-harness.mjs'

const client = client017
const fileActionsAdapter = client.adapters.find(adapter => adapter.id === 'deliverables.file.actions')

describe('adapter selection on the 0.1.7-rc.* topology', () => {
  it('finds the card child list nested under its owner and prefers it', () => {
    const { ctx } = contextFor(declarations017)
    assert.equal(client.declaredKind(ctx, 'deliverables.file.actions'), 'list')
    assert.equal(client.declaredKind(ctx, 'conversation.chat.turnTail'), 'list')
    assert.equal(client.selectAdapter(ctx), fileActionsAdapter)
  })

  it('declines when the line declares no per-file action list', () => {
    const { ctx } = contextFor(declarations015)
    assert.equal(fileActionsAdapter.accepts(ctx), false)
  })

  it('registers one list entry carrying the id the contract demands', () => {
    const { ctx, registrations } = contextFor(declarations017)
    client.apply(ctx)
    assert.equal(registrations.length, 1, 'the official turn tail is never claimed')
    const { options, component } = registrations[0]
    assert.equal(options.name, 'deliverables.file.actions')
    assert.equal(options.id, 'dsh-download-button')
    assert.equal(options.locale, 'downloadButton')
    assert.equal(options.select, undefined, 'a list entry carries no chain select')
    assert.equal(component, client.ActionDownload)
  })

  it('ignores a list turn tail with no action list instead of claiming it', () => {
    const { ctx, registrations } = contextFor([{ name: 'conversation.chat.turnTail', kind: 'list', scope: 'session', children: [] }])
    assert.doesNotThrow(() => client.apply(ctx))
    assert.deepEqual(registrations, [])
  })
})

describe('the button this adapter contributes', () => {
  let doubles

  before(() => { doubles = installDoubles() })
  after(() => { doubles.restore() })

  const ownerProps = (actionUrl = 'api/present.open?sessionId=s9&seq=12&index=3') => ({
    actionUrl,
    available: true,
    pending: false,
    onAction: () => {},
    t: translate,
  })

  it('renders the download button and hands the browser an anchor to the route', async () => {
    doubles.fetches.length = 0
    doubles.documentStub.anchors.length = 0
    const button = client.ActionDownload(ownerProps())
    assert.equal(button.props.className, 'ddb-download ddb-downloadAction')
    assert.equal(button.props['aria-label'], '下载')
    button.props.onClick()
    await new Promise(resolve => { setTimeout(resolve, 0) })
    assert.deepEqual(doubles.fetches, [['/api/download.button?sessionId=s9&seq=12&index=3', 'HEAD']])
    assert.equal(doubles.documentStub.anchors.length, 1)
    assert.equal(doubles.documentStub.anchors[0].clicked, 1)
    assert.equal(
      doubles.documentStub.anchors[0].download,
      undefined,
      'the Content-Disposition header names the file in list mode',
    )
    assert.ok(doubles.documentStub.anchors[0].rel.includes('noopener'))
  })

  it('renders the icon of the running line inside the button', () => {
    const button = client.ActionDownload(ownerProps())
    assert.equal(elementsOf(button, 'new.download').length, 1, '0.1.7-rc.* weight-suffixed icon')
  })

  it('renders nothing when the official action URL carries no durable coordinates', () => {
    assert.equal(client.ActionDownload(ownerProps('api/present.host')), null)
    assert.equal(client.ActionDownload(ownerProps('api/present.open?index=0')), null)
    assert.equal(client.ActionDownload({ actionUrl: undefined, t: translate }), null)
  })

  it('starts no download, and keeps the button, when the pre-check is refused', async () => {
    doubles.fetches.length = 0
    doubles.documentStub.anchors.length = 0
    doubles.state.respond = () => ({ ok: false, status: 404, json: () => Promise.resolve({}) })
    const button = client.ActionDownload(ownerProps())
    button.props.onClick()
    await new Promise(resolve => { setTimeout(resolve, 0) })
    doubles.state.respond = () => ({ ok: true, status: 200, json: () => Promise.resolve({}) })
    assert.deepEqual(doubles.fetches, [['/api/download.button?sessionId=s9&seq=12&index=3', 'HEAD']])
    assert.equal(doubles.documentStub.anchors.length, 0)
    assert.equal(button.props.className, 'ddb-download ddb-downloadAction')
  })
})
