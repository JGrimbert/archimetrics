// LA SORTIE JSON VALIDÉE + RÉESSAI (D-007 : un modèle de 4 B paramètres se trompe de format). La réponse est lue (blocs
// ```json et <think>…</think> retirés, premier objet JSON extrait), validée par `src/schema.mjs` puis par un contrôle
// facultatif (`check`, cohérence propre à l'appelant). En cas d'échec, la réponse et les erreurs sont rendues au modèle,
// qui a `retries` essais de plus. Chaque essai est noté (durée, erreurs) : le banc en tire le respect du format.

import { assertSupported, validate } from '../schema.mjs'

/** Le texte d'une réponse, sans raisonnement affiché ni clôture Markdown ; du premier `{` au dernier `}`. */
export function extractJson(content) {
  const text = String(content).replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim()
}

/**
 * Lit et valide une réponse : `{ value }` si elle convient, sinon `{ errors }`.
 * @param {string} content
 * @param {object} [schema]
 * @param {(value: unknown) => string[]} [check]
 */
export function parseAndValidate(content, schema, check) {
  let value
  try {
    value = JSON.parse(extractJson(content))
  } catch (e) {
    return { errors: [`JSON illisible : ${e.message}`] }
  }
  const errors = schema ? validate(schema, value) : []
  if (!errors.length && check) errors.push(...check(value))
  return errors.length ? { errors } : { value }
}

const retryMessage = (errors) => ({
  role: 'user',
  content: `Ta réponse ne respecte pas le format demandé :\n- ${errors.slice(0, 10).join('\n- ')}\n`
    + 'Réponds de nouveau avec UNIQUEMENT un objet JSON conforme au schéma, sans texte autour.',
})

/**
 * Appelle `provider.complete` jusqu'à une réponse valide, au plus `1 + retries` fois.
 * @param {import('./provider.mjs').Provider} provider
 * @param {import('./provider.mjs').Message[]} messages
 * @param {{ schema?: object, check?: (value: unknown) => string[], retries?: number, now?: () => number }} [o]
 * @returns {Promise<{ ok: boolean, value: unknown, attempts: { ms: number, errors: string[] }[], durationMs: number, usage: { input: number, output: number } }>}
 */
export async function completeJson(provider, messages, { schema, check, retries = 2, now = () => performance.now() } = {}) {
  if (schema) assertSupported(schema)
  const convo = [...messages]
  const attempts = []
  const usage = { input: 0, output: 0 }
  const t0 = now()
  for (let i = 0; i <= retries; i++) {
    const t = now()
    const res = await provider.complete(convo, { schema })
    usage.input += res.usage?.input ?? 0
    usage.output += res.usage?.output ?? 0
    const { value, errors } = parseAndValidate(res.content, schema, check)
    attempts.push({ ms: Math.round(now() - t), errors: errors ?? [] })
    if (!errors) return { ok: true, value, attempts, durationMs: Math.round(now() - t0), usage }
    convo.push({ role: 'assistant', content: res.content }, retryMessage(errors))
  }
  return { ok: false, value: null, attempts, durationMs: Math.round(now() - t0), usage }
}
