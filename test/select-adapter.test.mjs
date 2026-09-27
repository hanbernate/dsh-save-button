/**
 * Selector tests: how the plugin decides which adapter (if any) to compose through.
 *
 * Selection is capability-based and synchronous — it reads the registry's declaration tree
 * and the primitives export surface, never a DSH version number (none is available to a
 * client plugin: the boot payload carries only a content `rev`, and `ctx.modules.version`
 * is the `'client'` discriminant) and never a registration-error message.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  client017,
  contextFor,
  declarations015,
  declarations017,
  primitives015,
  primitives017,
  primitivesBare,
  reactStub,
} from './client-harness.mjs'

const client = client017
const adapters = Object.fromEntries(client.adapters.map(adapter => [adapter.id, adapter]))

describe('resolveIcons', () => {
  it('resolves the 0.1.5-rc.* size-suffixed names', () => {
    const icons = client.resolveIcons(primitives015)
    assert.deepEqual(icons, {
      IconChevronDown: 'old.chevronDown',
      IconChevronUp: 'old.chevronUp',
      IconRightUp: 'old.rightUp',
      IconFolderOpen: 'old.folderOpen',
      IconDownload: 'old.download',
    })
  })

  it('resolves the 0.1.7-rc.* weight-suffixed names', () => {
    const icons = client.resolveIcons(primitives017)
    assert.deepEqual(Object.values(icons), [
      'new.chevronDown', 'new.chevronUp', 'new.rightUp', 'new.folderOpen', 'new.download',
    ])
  })

  it('falls back to bare names only when nothing else exists', () => {
    const icons = client.resolveIcons(primitivesBare)
    assert.deepEqual(Object.values(icons), [
      'bare.chevronDown', 'bare.chevronUp', 'bare.rightUp', 'bare.folderOpen', 'bare.download',
    ])
  })

  it('reports undefined instead of throwing when no generation matches', () => {
    const icons = client.resolveIcons({})
    assert.deepEqual(Object.values(icons), [undefined, undefined, undefined, undefined, undefined])
  })

  it('keeps each icon on its own generation list, so a uniform suffix cannot creep in', () => {
    // The 0.1.5-rc.* chevrons shipped `…14` while the other three shipped `…16`.
    assert.deepEqual(client.ICON_GENERATIONS.IconChevronDown[0], 'IconChevronDownOutline14')
    assert.deepEqual(client.ICON_GENERATIONS.IconChevronUp[0], 'IconChevronUpOutline14')
    for (const name of ['IconRightUp', 'IconFolderOpen', 'IconDownload']) {
      assert.equal(client.ICON_GENERATIONS[name][0], `${name}Outline16`)
    }
    for (const generations of Object.values(client.ICON_GENERATIONS)) {
      assert.equal(generations.length, 3)
      assert.match(generations[1], /OutlineRegular$/)
    }
  })

  it('resolves the same module for every generated bundle face', () => {
    // `react` is the only other module the bundle requires, and the icons never fall back
    // to a raw string, so a resolved icon is always a real component.
    assert.equal(typeof reactStub.createElement, 'function')
    for (const icon of Object.values(client.resolveIcons(primitives017))) {
      assert.notEqual(icon, undefined)
    }
  })
})

describe('declaredKind', () => {
  it('reads a root declaration', () => {
    const { ctx } = contextFor([{ name: 'conversation.chat.turnTail', kind: 'chain', scope: 'session', children: [] }])
    assert.equal(client.declaredKind(ctx, 'conversation.chat.turnTail'), 'chain')
  })

  it('reads a child declaration nested under its owner', () => {
    const { ctx } = contextFor(declarations017)
    assert.equal(client.declaredKind(ctx, 'deliverables.file.actions'), 'list')
  })

  it('reads a deeply nested declaration', () => {
    const { ctx } = contextFor([{
      name: 'a',
      kind: 'list',
      scope: 'root',
      children: [{ name: 'b', kind: 'list', scope: 'root', children: [{ name: 'target', kind: 'chain', scope: 'session' }] }],
    }])
    assert.equal(client.declaredKind(ctx, 'target'), 'chain')
  })

  it('reports undefined for an undeclared key', () => {
    const { ctx } = contextFor(declarations015)
    assert.equal(client.declaredKind(ctx, 'deliverables.file.actions'), undefined)
  })

  it('survives a registry without snapshot() and malformed nodes', () => {
    const bare = { slots: {} }
    assert.equal(client.declaredKind(bare, 'anything'), undefined)
    const { ctx } = contextFor([null, { kind: 'list' }, { name: 'x', kind: 'list', children: null }])
    assert.equal(client.declaredKind(ctx, 'x'), 'list')
    assert.equal(client.declaredKind(ctx, 'missing'), undefined)
  })
})

describe('selectAdapter', () => {
  it('prefers the additive action list when both contracts are declared', () => {
    const { ctx } = contextFor(declarations017)
    assert.equal(client.selectAdapter(ctx), adapters['deliverables.file.actions'])
  })

  it('picks the chain adapter on the 0.1.5-rc.* topology', () => {
    const { ctx } = contextFor(declarations015)
    assert.equal(client.selectAdapter(ctx), adapters['conversation.chat.turnTail'])
  })

  it('picks nothing when no contract is declared', () => {
    const { ctx } = contextFor([])
    assert.equal(client.selectAdapter(ctx), undefined)
  })

  it('picks nothing on a list turn tail without the per-file action list', () => {
    const { ctx } = contextFor([{ name: 'conversation.chat.turnTail', kind: 'list', scope: 'session', children: [] }])
    assert.equal(client.selectAdapter(ctx), undefined, 'a chain entry cannot compose into a list slot')
  })

  it('returns undefined rather than throwing without a slot registry', () => {
    assert.doesNotThrow(() => client.selectAdapter({ slots: {} }))
    assert.equal(client.selectAdapter({ slots: {} }), undefined)
  })
})
