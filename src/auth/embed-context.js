export const EMBED_CONTEXT_HEADER = 'X-Map-Embed-Context'
export const EMBED_CONTEXT_VALUE = 'iframe'

export function isEmbeddedDocument (windowLike = globalThis.window) {
  if (!windowLike) return false
  try {
    return windowLike.self !== windowLike.top
  } catch {
    return true
  }
}

export function applyEmbeddedRequestContext (headers, windowLike = globalThis.window) {
  if (isEmbeddedDocument(windowLike)) {
    headers.set(EMBED_CONTEXT_HEADER, EMBED_CONTEXT_VALUE)
  }
  return headers
}
