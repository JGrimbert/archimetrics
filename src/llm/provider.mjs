// L'INTERFACE FOURNISSEUR (D-007) : un objet `{ name, model, baseUrl, complete(messages, { schema }) }` qui rend
// `{ content, usage }`. `createProvider` choisit l'adaptateur et applique la GARDE : une adresse qui n'est pas locale
// (boucle locale : `localhost`, `*.localhost`, `127.x.x.x`, `::1`) est refusée AVANT tout appel, sauf `allowRemote`
// (posé seulement par `--allow-remote`) ; une autorisation est journalisée (`log`, la sortie d'erreur par défaut).

import { ollama } from './ollama.mjs'
import { openaiCompatible } from './openai-compatible.mjs'

/**
 * @typedef {{ role: 'system' | 'user' | 'assistant', content: string }} Message
 * @typedef {{ content: string, usage: { input: number | null, output: number | null } }} Completion
 * @typedef {{ name: string, model: string, baseUrl: string, complete(messages: Message[], o?: { schema?: object }): Promise<Completion> }} Provider
 */

export const ADAPTERS = { ollama, 'openai-compatible': openaiCompatible }

/** Une erreur levée par la garde : appel distant sans `--allow-remote`. */
export class RemoteRefusedError extends Error {
  constructor(host) {
    super(`appel distant refusé vers ${host} : passer --allow-remote pour l'autoriser (D-007)`)
    this.name = 'RemoteRefusedError'
    this.code = 'ARCHIMETRICS_REMOTE_REFUSED'
    this.host = host
  }
}

/** Vrai si `url` vise la machine elle-même (boucle locale). Une adresse illisible n'est pas locale. */
export function isLocalUrl(url) {
  let host
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '[::1]' || host === '::1') return true
  return /^127(\.\d{1,3}){3}$/.test(host)
}

/**
 * La garde seule : rend `{ remote }`, lève `RemoteRefusedError` si l'adresse est distante sans autorisation.
 * @param {string} url
 * @param {{ allowRemote?: boolean, log?: (line: string) => void }} [o]
 */
export function guardRemote(url, { allowRemote = false, log = (l) => process.stderr.write(`${l}\n`) } = {}) {
  if (isLocalUrl(url)) return { remote: false }
  const host = (() => { try { return new URL(url).host } catch { return String(url) } })()
  if (!allowRemote) throw new RemoteRefusedError(host)
  log(`archimetrics : appel distant autorisé (--allow-remote) vers ${host}`)
  return { remote: true }
}

/**
 * Le fournisseur décrit par `spec`, après la garde.
 * @param {{ type?: 'ollama' | 'openai-compatible', model: string, baseUrl?: string, apiKeyEnv?: string, timeoutMs?: number }} spec
 * @param {{ allowRemote?: boolean, log?: (line: string) => void, fetch?: typeof fetch, env?: object }} [o]
 * @returns {Provider & { remote: boolean }}
 */
export function createProvider(spec, { allowRemote = false, log, fetch, env } = {}) {
  const type = spec.type ?? 'ollama'
  const make = ADAPTERS[type]
  if (!make) throw new Error(`fournisseur inconnu « ${type} » (connus : ${Object.keys(ADAPTERS).join(', ')})`)
  if (!spec.model) throw new Error('fournisseur : model requis')
  const provider = make({ ...spec, fetch, env })
  const { remote } = guardRemote(provider.baseUrl, { allowRemote, log })
  return { ...provider, remote }
}
