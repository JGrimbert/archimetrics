// L'ADAPTATEUR « COMPATIBLE OPENAI » : `POST <base>/chat/completions` (LM Studio, llama.cpp server, vLLM, ou un service
// distant). `baseUrl` inclut le préfixe de version (`http://127.0.0.1:1234/v1`). Le schéma passe en `response_format`
// `json_schema` ; sans schéma, `json_object`. La clé n'est jamais écrite : elle se lit dans une variable d'environnement
// nommée par `apiKeyEnv`.

import { joinUrl, postJson, ProviderError } from './http.mjs'

/**
 * @param {{ model: string, baseUrl: string, apiKeyEnv?: string, timeoutMs?: number, env?: Record<string, string | undefined>, fetch?: typeof fetch }} o
 * @returns {import('./provider.mjs').Provider}
 */
export function openaiCompatible({ model, baseUrl, apiKeyEnv, timeoutMs, env = process.env, fetch }) {
  if (!baseUrl) throw new Error('compatible OpenAI : baseUrl requis (ex. http://127.0.0.1:1234/v1)')
  const key = apiKeyEnv ? env[apiKeyEnv] : null
  if (apiKeyEnv && !key) throw new Error(`compatible OpenAI : variable d'environnement ${apiKeyEnv} vide`)
  return {
    name: 'openai-compatible',
    model,
    baseUrl,
    async complete(messages, { schema } = {}) {
      const url = joinUrl(baseUrl, '/chat/completions')
      const format = schema
        ? { type: 'json_schema', json_schema: { name: 'sortie', schema, strict: false } }
        : { type: 'json_object' }
      const body = { model, messages, temperature: 0, response_format: format }
      const headers = key ? { authorization: `Bearer ${key}` } : {}
      const res = await postJson({ url, body, headers, timeoutMs, fetch })
      const content = res?.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new ProviderError(`réponse sans choices[0].message.content de ${url}`)
      return { content, usage: { input: res.usage?.prompt_tokens ?? null, output: res.usage?.completion_tokens ?? null } }
    },
  }
}
