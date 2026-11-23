// L'APPEL HTTP commun aux adaptateurs : un POST JSON, une réponse JSON, une borne de durée. `fetch` est injecté (les tests
// passent un faux, jamais le réseau) ; par défaut, le `fetch` natif de Node ≥ 20. Aucune dépendance.

/** Une erreur de fournisseur : statut HTTP (ou null), et le début du corps reçu. */
export class ProviderError extends Error {
  constructor(message, { status = null, body = '' } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
    this.body = body
  }
}

/**
 * POST `body` (JSON) vers `url` ; rend la réponse lue en JSON.
 * @param {{ url: string, body: unknown, headers?: Record<string, string>, timeoutMs?: number, fetch?: typeof fetch }} req
 */
export async function postJson({ url, body, headers = {}, timeoutMs = 120_000, fetch: doFetch = globalThis.fetch }) {
  let res
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    throw new ProviderError(`appel impossible (${url}) : ${e.message}`)
  }
  const text = await res.text()
  if (!res.ok) throw new ProviderError(`réponse ${res.status} de ${url}`, { status: res.status, body: text.slice(0, 500) })
  try {
    return JSON.parse(text)
  } catch {
    throw new ProviderError(`réponse illisible (pas du JSON) de ${url}`, { status: res.status, body: text.slice(0, 500) })
  }
}

/** `base` sans barre oblique finale, suivi de `path`. */
export const joinUrl = (base, path) => `${String(base).replace(/\/+$/, '')}${path}`
