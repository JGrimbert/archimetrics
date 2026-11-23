// L'ADAPTATEUR OLLAMA : `POST <base>/api/chat`, sans flux. Le schéma attendu passe dans `format` (Ollama ≥ 0.5 contraint la
// sortie par un schéma JSON) ; sans schéma, `format: "json"`. Température 0 et graine fixe (42) par défaut, pour un banc
// rejouable ; mesuré (bench/resultats.md) : cela ne couvre pas l'écart entre le premier passage après chargement du modèle
// et les passages à chaud.

import { joinUrl, postJson, ProviderError } from './http.mjs'

export const OLLAMA_URL = 'http://127.0.0.1:11434'

/**
 * @param {{ model: string, baseUrl?: string, timeoutMs?: number, options?: object, fetch?: typeof fetch }} o
 * @returns {import('./provider.mjs').Provider}
 */
export function ollama({ model, baseUrl = OLLAMA_URL, timeoutMs, options = {}, fetch }) {
  return {
    name: 'ollama',
    model,
    baseUrl,
    async complete(messages, { schema } = {}) {
      const url = joinUrl(baseUrl, '/api/chat')
      const body = { model, messages, stream: false, format: schema ?? 'json', options: { temperature: 0, seed: 42, ...options } }
      const res = await postJson({ url, body, timeoutMs, fetch })
      const content = res?.message?.content
      if (typeof content !== 'string') throw new ProviderError(`réponse sans message.content de ${url}`)
      return { content, usage: { input: res.prompt_eval_count ?? null, output: res.eval_count ?? null } }
    },
  }
}
