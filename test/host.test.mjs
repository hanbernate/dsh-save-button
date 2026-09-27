/**
 * Host-half integration tests: `apply` against a stubbed Cordis context,
 * driving the registered route end to end — coordinates to durable event to
 * Session filesystem to a streamed attachment.
 *
 * The security claim of the README is asserted here: the route cannot be
 * pointed at a path, and it refuses coordinates that name no declaration.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply, DOWNLOAD_PATH, inject, name } from '../lib/index.js'

/** A 3000-byte stand-in for a build archive. */
const source = Buffer.alloc(3000, 42)

/** One declared delivery at sequence 7. */
const presentedEvent = {
  type: 'deliverables/presented',
  data: { turn: 3, files: [{ path: 'build/HexHowitzer-windows-x86_64.zip', description: 'release' }] },
}

/**
 * A Host context with just enough behaviour to serve a download.
 * @param options.event - the event `readEvent` returns, or `null` for none.
 * @param options.info - the `fs.stat` result; `false` means "no longer there".
 * @param options.workspaceBytes - `workspaceFiles.stat` byte size, or `false` when unreported.
 * @param options.failure - thrown by `readEvent` instead of returning an event.
 * @param options.requested - collects the paths the route resolved.
 */
function hostContext({
  event = presentedEvent,
  info = { type: 'file', size: source.byteLength },
  workspaceBytes = source.byteLength,
  failure,
  requested = [],
} = {}) {
  const routes = []
  const ctx = {
    effect: (callback) => callback(),
    connection: { fetch: { register: (route) => { routes.push(route); return async () => {} } } },
    sessionQuery: {
      readEvent: async () => {
        if (failure !== undefined) throw failure
        return { target: event, session: { cwd: '/home/me/hex-howitzer' } }
      },
    },
    workspaceFiles: {
      stat: async (scope, path) => {
        requested.push({ scope, path })
        return {
          absolutePath: `/home/me/hex-howitzer/${path}`,
          version: 'v1',
          ...typeof workspaceBytes === 'number' ? { bytes: workspaceBytes } : {},
        }
      },
    },
    fs: {
      resolve: async path => ({ path }),
      stat: async () => (info === false ? undefined : info),
      readByteRange: async (_target, { offset, length }) => source.subarray(offset, offset + length),
    },
    sandboxPolicy: { workspaceRoot: '/home/me/hex-howitzer' },
  }
  apply(ctx)
  assert.equal(routes.length, 1)
  return { route: routes[0], requested }
}

/** One route request. */
function call(route, query, method = 'GET') {
  return route.fetch(new Request(`http://127.0.0.1:3080${DOWNLOAD_PATH}?${query}`, { method }))
}

describe('plugin identity', () => {
  it('names itself and declares the services it reads', () => {
    assert.equal(name, 'download-button')
    assert.deepEqual(inject, ['connection', 'sessionQuery', 'workspaceFiles', 'fs', 'sandboxPolicy'])
  })
})

describe('route registration', () => {
  it('owns one exact authenticated route with GET and HEAD', () => {
    const { route } = hostContext()
    assert.equal(route.path, '/api/download.button')
    assert.deepEqual(route.methods, ['GET', 'HEAD'])
    assert.equal(route.requestBody, 'buffered')
    assert.equal(typeof route.fetch, 'function')
  })
})

describe('serving a declared delivery', () => {
  it('streams the file with an attachment disposition and the announced length', async () => {
    const { route, requested } = hostContext()
    const response = await call(route, 'sessionId=session-1&seq=7&index=0')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/octet-stream')
    assert.equal(
      response.headers.get('content-disposition'),
      'attachment; filename="HexHowitzer-windows-x86_64.zip"; filename*=UTF-8\'\'HexHowitzer-windows-x86_64.zip',
    )
    assert.equal(response.headers.get('content-length'), String(source.byteLength))
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), source)
    assert.deepEqual(requested, [{
      scope: { sessionId: 'session-1', workspaceRoot: '/home/me/hex-howitzer' },
      path: 'build/HexHowitzer-windows-x86_64.zip',
    }])
  })

  it('answers HEAD with the same headers and no body', async () => {
    const { route } = hostContext()
    const response = await call(route, 'sessionId=session-1&seq=7&index=0', 'HEAD')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-length'), String(source.byteLength))
    assert.equal(response.body, null)
  })

  it('falls back to the Session filesystem size when the provider reports none', async () => {
    const { route } = hostContext({ info: { type: 'file' } })
    const response = await call(route, 'sessionId=session-1&seq=7&index=0')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-length'), String(source.byteLength))
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), source)
  })

  it('streams to the provider-reported end when no size is known at all', async () => {
    const { route } = hostContext({ info: { type: 'file' }, workspaceBytes: false })
    const response = await call(route, 'sessionId=session-1&seq=7&index=0')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-length'), null, 'an unknown size omits the header')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), source)
  })
})

describe('refusals', () => {
  it('never accepts a path in place of the durable coordinates', async () => {
    const { route, requested } = hostContext()
    const response = await call(route, 'path=/etc/passwd')
    assert.equal(response.status, 400)
    assert.deepEqual(requested, [], 'nothing is resolved for a path-only request')
  })

  it('rejects malformed coordinates', async () => {
    const { route } = hostContext()
    for (const query of [
      'sessionId=session-1&seq=abc&index=0',
      'sessionId=session-1&seq=7',
      'sessionId=&seq=7&index=0',
      'sessionId=session-1&seq=-1&index=0',
    ]) {
      assert.equal((await call(route, query)).status, 400, query)
    }
  })

  it('404s when the event is not a delivery or the index is out of range', async () => {
    const { route } = hostContext({ event: { type: 'tool/result', data: {} } })
    assert.equal((await call(route, 'sessionId=s&seq=7&index=0')).status, 404)
    const outOfRange = hostContext()
    assert.equal((await call(outOfRange.route, 'sessionId=s&seq=7&index=9')).status, 404)
  })

  it('422s when the declaration no longer names a regular file', async () => {
    const directory = hostContext({ info: { type: 'directory' } })
    assert.equal((await call(directory.route, 'sessionId=s&seq=7&index=0')).status, 422)
    const gone = hostContext({ info: false })
    assert.equal((await call(gone.route, 'sessionId=s&seq=7&index=0')).status, 422)
  })

  it('maps a Host failure to its own status instead of a blanket 500', async () => {
    const missing = hostContext({ failure: Object.assign(new Error('no entry'), { code: 'workspace-file/not-found' }) })
    assert.equal((await call(missing.route, 'sessionId=s&seq=7&index=0')).status, 404)
    const outside = hostContext({ failure: Object.assign(new Error('outside'), { code: 'workspace-file/outside-workspace' }) })
    assert.equal((await call(outside.route, 'sessionId=s&seq=7&index=0')).status, 422)
    const broken = hostContext({ failure: new Error('boom') })
    assert.equal((await call(broken.route, 'sessionId=s&seq=7&index=0')).status, 500)
  })
})
