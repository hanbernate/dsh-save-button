/**
 * Host helper tests: query validation, header safety, failure classification,
 * and the chunked byte stream. No Host, no Cordis context.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  basenameOf,
  contentDisposition,
  createByteStream,
  downloadCoordinates,
  failureStatusOf,
  isCount,
  isPresentedData,
  isPresentedFile,
} from '../lib/download.js'

/** Read a whole stream into one buffer. */
async function collect(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

describe('downloadCoordinates', () => {
  it('accepts the durable triple the official open route uses', () => {
    const params = new URLSearchParams({ sessionId: 'session-1', seq: '12', index: '0' })
    assert.deepEqual(downloadCoordinates(params), { sessionId: 'session-1', seq: 12, index: 0 })
  })

  it('rejects a missing session, a missing coordinate, and non-decimal forms', () => {
    assert.match(downloadCoordinates(new URLSearchParams({ seq: '1', index: '0' })).error, /sessionId/)
    assert.match(downloadCoordinates(new URLSearchParams({ sessionId: 's' })).error, /seq\/index/)
    for (const seq of ['', '-1', '1.5', '1e3', 'abc', ' 1', '1 ']) {
      assert.ok(downloadCoordinates(new URLSearchParams({ sessionId: 's', seq, index: '0' })).error !== undefined, seq)
    }
  })

  it('tolerates a leading zero, which names the same durable sequence', () => {
    assert.deepEqual(
      downloadCoordinates(new URLSearchParams({ sessionId: 's', seq: '007', index: '00' })),
      { sessionId: 's', seq: 7, index: 0 },
    )
  })

  it('has no path parameter — a path in the query is ignored', () => {
    const params = new URLSearchParams({ sessionId: 's', seq: '3', index: '1', path: '/etc/passwd' })
    const coordinates = downloadCoordinates(params)
    assert.deepEqual(Object.keys(coordinates).sort(), ['index', 'seq', 'sessionId'])
  })

  it('isCount keeps zero and rejects empty strings', () => {
    assert.equal(isCount('0'), true)
    assert.equal(isCount(''), false)
    assert.equal(isCount(null), false)
  })
})

describe('declaration validation', () => {
  it('accepts a declared path with and without a description', () => {
    assert.equal(isPresentedFile({ path: 'build/app.zip' }), true)
    assert.equal(isPresentedFile({ path: 'build/app.zip', description: 'release' }), true)
  })

  it('rejects blank paths, wrong types, and arrays', () => {
    assert.equal(isPresentedFile({ path: '   ' }), false)
    assert.equal(isPresentedFile({ path: 7 }), false)
    assert.equal(isPresentedFile({ path: 'a', description: 1 }), false)
    assert.equal(isPresentedFile([]), false)
    assert.equal(isPresentedFile(null), false)
  })

  it('accepts only a files array as presented data', () => {
    assert.equal(isPresentedData({ files: [] }), true)
    assert.equal(isPresentedData({ files: 'x' }), false)
    assert.equal(isPresentedData([]), false)
  })
})

describe('contentDisposition', () => {
  it('keeps an ASCII name in both forms', () => {
    assert.equal(
      contentDisposition('/w/build/HexHowitzer-windows-x86_64.zip'),
      'attachment; filename="HexHowitzer-windows-x86_64.zip"; filename*=UTF-8\'\'HexHowitzer-windows-x86_64.zip',
    )
  })

  it('percent-encodes a non-ASCII name and keeps the fallback header-safe', () => {
    const value = contentDisposition('/w/构建产物.zip')
    assert.match(value, /filename="____\.zip"/)
    assert.match(value, /filename\*=UTF-8''%E6%9E%84%E5%BB%BA%E4%BA%A7%E7%89%A9\.zip/)
  })

  it('never lets a quote escape the quoted fallback', () => {
    const value = contentDisposition('/w/a"b.zip')
    assert.match(value, /filename="a_b\.zip"/)
    assert.equal(value.includes('"b'), false)
  })

  it('falls back to a usable name for a root-ish path', () => {
    assert.equal(basenameOf('/'), 'download')
    assert.equal(basenameOf('C:\\'), 'download')
    assert.equal(basenameOf('C:/'), 'download')
    assert.equal(basenameOf('C:\\build\\out.zip'), 'out.zip')
  })
})

describe('failureStatusOf', () => {
  it('maps missing things to 404 and unusable things to 422', () => {
    assert.equal(failureStatusOf({ code: 'workspace-file/not-found' }), 404)
    assert.equal(failureStatusOf({ code: 'session/not-found' }), 404)
    assert.equal(failureStatusOf({ code: 'ENOENT' }), 404)
    assert.equal(failureStatusOf({ code: 'workspace-file/not-regular-file' }), 422)
    assert.equal(failureStatusOf({ code: 'workspace-file/outside-workspace' }), 422)
  })

  it('keeps the rest honest', () => {
    assert.equal(failureStatusOf({ code: 'gateway/bad-request' }), 400)
    assert.equal(failureStatusOf(new Error('boom')), 500)
    assert.equal(failureStatusOf(undefined), 500)
  })
})

describe('createByteStream', () => {
  const source = Buffer.alloc(5000, 7)

  it('streams a known size in chunk-size windows and stops exactly at the end', async () => {
    const windows = []
    const stream = createByteStream({
      bytes: source.byteLength,
      chunkBytes: 2048,
      read: (offset, length) => {
        windows.push([offset, length])
        return Promise.resolve(source.subarray(offset, offset + length))
      },
    })
    assert.deepEqual(await collect(stream), source)
    assert.deepEqual(windows, [[0, 2048], [2048, 2048], [4096, 904]])
  })

  it('reads to the provider-reported end when the size is unknown', async () => {
    const stream = createByteStream({
      read: (offset, length) => Promise.resolve(offset >= source.byteLength
        ? new Uint8Array(0)
        : source.subarray(offset, offset + length)),
    })
    assert.deepEqual(await collect(stream), source)
  })

  it('stops at the announced size when the file grew mid-download', async () => {
    const grown = Buffer.alloc(9000, 7)
    const stream = createByteStream({
      bytes: 5000,
      chunkBytes: 4096,
      read: (offset, length) => Promise.resolve(grown.subarray(offset, offset + length)),
    })
    const received = await collect(stream)
    assert.equal(received.byteLength, 5000)
  })

  it('ends when the provider returns an empty chunk before the announced size', async () => {
    const stream = createByteStream({
      bytes: 4096,
      read: () => Promise.resolve(new Uint8Array(0)),
    })
    assert.equal((await collect(stream)).byteLength, 0)
  })

  it('surfaces a provider failure to the consumer', async () => {
    const stream = createByteStream({ read: () => Promise.reject(new Error('read failed')) })
    await assert.rejects(collect(stream), /read failed/)
  })

  it('refuses to pull after the caller aborts', async () => {
    const aborted = AbortSignal.abort()
    const stream = createByteStream({ read: () => Promise.resolve(new Uint8Array(1)), signal: aborted })
    await assert.rejects(collect(stream))
  })
})
