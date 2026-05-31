export const EXPLORER_RETRY_DELAYS_MS = [300, 800, 1600, 3000]

export function normalizeExplorerTree(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.tree)) return payload.tree
  return []
}

export function shouldRetryExplorerFetch({ attempt, maxAttempts, response, error }) {
  if (attempt >= maxAttempts - 1) return false
  if (error) return true
  if (!response) return false

  return response.status === 0 || response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function fetchExplorerTree({
  fetchImpl = globalThis.fetch,
  retryDelays = EXPLORER_RETRY_DELAYS_MS,
  pause = wait,
} = {}) {
  const maxAttempts = retryDelays.length + 1

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl('/api/v1/books/explorer')
      if (response.ok) {
        const payload = await response.json()
        return { ok: true, tree: normalizeExplorerTree(payload), attempts: attempt + 1 }
      }
      if (!shouldRetryExplorerFetch({ attempt, maxAttempts, response })) {
        return { ok: false, tree: [], response, attempts: attempt + 1 }
      }
    } catch (error) {
      if (!shouldRetryExplorerFetch({ attempt, maxAttempts, error })) {
        return { ok: false, tree: [], error, attempts: attempt + 1 }
      }
    }

    await pause(retryDelays[attempt])
  }

  return { ok: false, tree: [], attempts: maxAttempts }
}
