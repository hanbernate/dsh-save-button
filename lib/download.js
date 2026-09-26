/**
 * Pure helpers for the delivery-card download route: query validation, safe
 * response headers, failure classification, and the chunked byte stream.
 *
 * Nothing here touches a Cordis context, so every branch is unit-testable
 * without a Host. `index.js` owns the wiring; this module owns the rules.
 * @module dsh-present-download/download
 */

/** Authenticated exact Fetch route serving one declared delivery as an attachment. */
export const DOWNLOAD_PATH = '/api/present.download'

/** Bytes pulled from the Session filesystem per stream chunk (backpressure unit). */
export const CHUNK_BYTES = 1 << 20

/** Content type of every delivery; the filename, not sniffing, names the file. */
export const DOWNLOAD_CONTENT_TYPE = 'application/octet-stream'

/**
 * Validate the delivery coordinates carried by the query string.
 *
 * The coordinates are the same triple the official `/api/present.open` route
 * uses — Session, durable event sequence, index inside that event — so a
 * request can only ever name a file the Session itself declared with
 * `present`. There is deliberately no path parameter.
 * @param params - decoded query parameters.
 * @returns the coordinates, or the reason they are unusable.
 */
export function downloadCoordinates(params) {
  const sessionId = params.get('sessionId') ?? ''
  if (sessionId.length === 0) return { error: 'missing sessionId query parameter' }
  const seq = params.get('seq')
  const index = params.get('index')
  if (!isCount(seq) || !isCount(index)) {
    return { error: 'missing or invalid seq/index query parameter' }
  }
  return { sessionId, seq: Number(seq), index: Number(index) }
}

/**
 * Whether a query value is a non-negative safe integer written in decimal.
 * @param value - raw query value.
 * @returns true for `0`, `12`, and rejects `''`, `01`, `-1`, `1e3`, `abc`.
 */
export function isCount(value) {
  return value !== null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
}

/**
 * Validate one file declaration read from a Session log.
 * @param value - decoded durable declaration.
 * @returns whether it carries a non-blank path and an optional description.
 */
export function isPresentedFile(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { path, description } = value
  return typeof path === 'string' && path.trim().length > 0
    && (description === undefined || typeof description === 'string')
}

/**
 * Validate a `deliverables/presented` event payload before indexing it.
 * @param value - decoded durable event data.
 * @returns whether the payload is an array of file declarations.
 */
export function isPresentedData(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Array.isArray(value.files)
}

/**
 * The last path segment, for either separator, without a runtime dependency on
 * the Host platform's path rules.
 * @param path - declared path, absolute or relative.
 * @returns the basename, or `download` when the path names no segment.
 */
export function basenameOf(path) {
  const segments = String(path).split(/[/\\]+/).filter(segment => segment.length > 0)
  const last = segments[segments.length - 1]
  // A drive root (`C:\`, `C:/`) names no file, so it gets the same fallback a
  // bare `/` does.
  return last === undefined || /^[A-Za-z]:$/.test(last) ? 'download' : last
}

/**
 * Build a `Content-Disposition` value that survives non-ASCII names.
 *
 * The ASCII fallback is only for very old clients; every current browser reads
 * the RFC 5987 `filename*` form, so a Chinese filename downloads as itself.
 * @param path - declared path the name is taken from.
 * @returns the header value.
 */
export function contentDisposition(path) {
  const name = basenameOf(path)
  const ascii = name.replace(/[^\u0020-\u007e]/g, '_').replace(/["\\]/g, '_') || 'download'
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/**
 * Map one failure to the status the browser should see.
 *
 * `RemoteError` carries a stable public `code`; filesystem errors carry a Node
 * code. Anything unrecognized stays a 500 rather than being dressed up as a
 * user error.
 * @param error - the caught value.
 * @returns an HTTP status code.
 */
export function failureStatusOf(error) {
  const code = typeof error?.code === 'string' ? error.code : undefined
  if (code === undefined) return 500
  if (code === 'gateway/bad-request') return 400
  if (code.endsWith('not-found')
    || code === 'SESSION_QUERY_SESSION_NOT_FOUND'
    || code === 'SESSION_QUERY_EVENT_NOT_FOUND'
    || code === 'ENOENT' || code === 'ENOTDIR') return 404
  if (code === 'workspace-file/not-regular-file'
    || code === 'workspace-file/outside-workspace'
    || code === 'workspace-file/too-large') return 422
  return 500
}

/**
 * Stream exactly the bytes the response announced.
 *
 * One chunk is pulled per consumer demand, so a slow browser bounds Host
 * memory instead of buffering the whole archive. `bytes` (the size read at
 * resolution time) both caps the body at the announced `Content-Length` and
 * ends the stream if the file grows mid-download; an unknown size reads until
 * the provider returns an empty chunk.
 * @param options.bytes - announced byte size, or undefined when unknown.
 * @param options.read - reads one window; resolves to a possibly shorter chunk.
 * @param options.signal - aborts the stream between chunks.
 * @param options.chunkBytes - window size, defaulting to {@link CHUNK_BYTES}.
 * @returns the response body.
 */
export function createByteStream({ bytes, read, signal, chunkBytes = CHUNK_BYTES }) {
  let offset = 0
  return new ReadableStream({
    async pull(controller) {
      if (signal?.aborted === true) {
        controller.error(signal.reason ?? new Error('Download aborted'))
        return
      }
      const want = bytes === undefined ? chunkBytes : Math.min(chunkBytes, bytes - offset)
      if (want <= 0) {
        controller.close()
        return
      }
      let chunk
      try {
        chunk = await read(offset, want)
      } catch (error) {
        controller.error(error)
        return
      }
      if (chunk === undefined || chunk.byteLength === 0) {
        controller.close()
        return
      }
      offset += chunk.byteLength
      controller.enqueue(chunk)
      if (bytes !== undefined && offset >= bytes) controller.close()
    },
  })
}
