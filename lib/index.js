/**
 * dsh-save-button — Host half.
 *
 * Registers one authenticated exact Fetch route, `/api/download.button`,
 * that turns a file the Session declared with `present` into a browser
 * download. The route resolves its target exactly the way the official
 * `/api/present.open` route does:
 *
 *   (sessionId, seq, index) -> durable `deliverables/presented` event
 *     -> declared path -> Session filesystem -> regular file
 *     -> chunked byte stream with `Content-Disposition: attachment`
 *
 * Because the coordinates name a durable declaration rather than a path,
 * the route cannot be pointed at an arbitrary Host file, and because it is
 * registered on Connection's shared `/api` channel it inherits the same
 * trust fence and browser authentication as every other Host route.
 * @module dsh-save-button
 */

import { basename } from 'node:path'
import {
  contentDisposition,
  createByteStream,
  DOWNLOAD_CONTENT_TYPE,
  DOWNLOAD_PATH,
  downloadCoordinates,
  failureStatusOf,
  isPresentedData,
  isPresentedFile,
} from './download.js'

export { DOWNLOAD_PATH }

/** Cordis plugin name. */
export const name = 'download-button'

/** Services the download route reads. */
export const inject = ['connection', 'sessionQuery', 'workspaceFiles', 'fs', 'sandboxPolicy']

/**
 * Register the download route on the shared API channel.
 * @param ctx - Host context carrying the Session query, filesystem, and route lifetime.
 */
export function apply(ctx) {
  const lifetime = new AbortController()
  const pending = new Set()
  ctx.effect(() => async () => {
    lifetime.abort()
    await Promise.allSettled(pending)
  }, 'download-button: in-flight downloads')
  ctx.connection.fetch.register({
    path: DOWNLOAD_PATH,
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: (request) => {
      const task = handleDownload(ctx, new Request(request, {
        signal: AbortSignal.any([request.signal, lifetime.signal]),
      }))
      pending.add(task)
      const settle = () => { pending.delete(task) }
      void task.then(settle, settle)
      return task
    },
  })
}

/**
 * Serve one declared delivery as an attachment.
 * @param ctx - Host context.
 * @param request - authenticated GET or HEAD request.
 * @returns the download response, or a plain-text failure.
 */
async function handleDownload(ctx, request) {
  const coordinates = downloadCoordinates(new URL(request.url).searchParams)
  if (coordinates.error !== undefined) return new Response(coordinates.error, { status: 400 })
  const { sessionId, seq, index } = coordinates
  try {
    request.signal.throwIfAborted()
    const { target: event, session } = await ctx.sessionQuery.readEvent(
      { sessionId, seq, before: 0, after: 0 },
      request.signal,
    )
    const file = event.type === 'deliverables/presented' && isPresentedData(event.data)
      ? event.data.files[index]
      : undefined
    if (!isPresentedFile(file)) return new Response('Presented file not found in this Session result.', { status: 404 })
    request.signal.throwIfAborted()
    const stat = await ctx.workspaceFiles.stat({
      sessionId,
      workspaceRoot: session.cwd ?? ctx.sandboxPolicy.workspaceRoot,
    }, file.path, request.signal)
    const fsTarget = await ctx.fs.resolve(stat.absolutePath, { signal: request.signal })
    const info = await ctx.fs.stat(fsTarget, request.signal)
    if (info === undefined || info.type !== 'file') {
      return new Response('Presented file is not a readable regular file.', { status: 422 })
    }
    request.signal.throwIfAborted()
    const bytes = info.size ?? stat.bytes
    const headers = {
      'content-type': DOWNLOAD_CONTENT_TYPE,
      'content-disposition': contentDisposition(basename(stat.absolutePath)),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...bytes === undefined ? {} : { 'content-length': String(bytes) },
    }
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
    return new Response(createByteStream({
      bytes,
      signal: request.signal,
      read: (offset, length) => ctx.fs.readByteRange(fsTarget, { offset, length }, request.signal),
    }), { status: 200, headers })
  } catch (error) {
    if (request.signal.aborted) return new Response('Download cancelled.', { status: 499 })
    return new Response('Presented file unavailable.', { status: failureStatusOf(error) })
  }
}
