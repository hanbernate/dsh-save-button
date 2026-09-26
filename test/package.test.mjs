/**
 * Package-shape guards: the manifest fields the DSH loader and client-modules
 * reader actually consume, the patch layer that inserts the loader entry, and
 * the module requests the browser bundle is allowed to make.
 *
 * A hand-written bundle has no build step to catch these, so they are asserted
 * here instead.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
const hostHalf = await readFile(join(root, manifest.main), 'utf8')
const clientHalf = await readFile(join(root, manifest.exports['./client']), 'utf8')

/** Module specifiers a file imports or requires. */
function specifiersOf(source) {
  const found = new Set()
  for (const match of source.matchAll(/(?:^|[^\w$.])(?:import|require)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    found.add(match[1])
  }
  return [...found]
}

describe('manifest', () => {
  it('declares the bundle patch and the web client half the loader reads', () => {
    assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(manifest.dsh.client.platform, 'web')
    assert.equal(manifest.type, 'module')
    assert.equal(typeof manifest.exports['.'], 'string')
    assert.equal(typeof manifest.exports['./client'], 'string')
  })

  it('points every declared path at a file that exists', () => {
    for (const relative of [manifest.main, manifest.exports['./client'], manifest.dsh.bundle.patch]) {
      assert.ok(existsSync(join(root, relative)), `${relative} exists`)
    }
  })

  it('installs with no runtime dependencies, so `dsh plugin add` needs no build', () => {
    assert.equal(manifest.dependencies, undefined)
    assert.equal(manifest.scripts?.postinstall, undefined)
    assert.equal(manifest.scripts?.prepare, undefined)
  })
})

describe('patch layer', () => {
  it('inserts exactly one entry naming this package', () => {
    assert.match(patch, /- insert:/)
    const names = [...patch.matchAll(/^\s+name:\s*'([^']+)'/gm)].map(match => match[1])
    assert.deepEqual(names, [manifest.name])
  })
})

describe('module requests', () => {
  it('the host half imports only node builtins and its own files', () => {
    for (const specifier of specifiersOf(hostHalf)) {
      assert.ok(
        specifier.startsWith('node:') || specifier.startsWith('./') || specifier.startsWith('../'),
        `host half may not import ${specifier}`,
      )
    }
  })

  it('the bundle requests the bundle id matching the package name', () => {
    const id = /id:\s*'([^']+)'/.exec(clientHalf)
    assert.equal(id?.[1], manifest.name)
  })

  it('the bundle requires only the implicit client baseline and what it declares', () => {
    const baseline = new Set([
      'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
    ])
    const allowed = new Set([...baseline, ...manifest.dsh.client.inject])
    const requested = specifiersOf(clientHalf).filter(specifier => !specifier.startsWith('.'))
    assert.deepEqual(requested, ['react', '@deepseek-ai/dsh-client-ui-primitives'])
    for (const specifier of requested) assert.ok(allowed.has(specifier), `${specifier} is allowed`)
  })

  it('the bundle never asks for the official deliverables package', () => {
    assert.equal(clientHalf.includes('dsh-client-ui-deliverables'), false)
  })
})
