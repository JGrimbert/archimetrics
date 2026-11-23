import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import {
  completeJson, createProvider, extractJson, guardRemote, isLocalUrl, ProviderError, RemoteRefusedError,
} from '../src/llm/index.mjs'

// AUCUN APPEL RÉSEAU : le `fetch` global est piégé pour tout ce fichier ; chaque adaptateur reçoit un faux `fetch`.
let globalCalls = 0
const realFetch = globalThis.fetch
globalThis.fetch = async () => {
  globalCalls++
  throw new Error('réseau interdit dans les tests')
}
after(() => {
  globalThis.fetch = realFetch
  assert.equal(globalCalls, 0, 'le fetch global n’a jamais été appelé')
})

/** Un faux `fetch` qui note les requêtes et rend, dans l'ordre, les corps donnés (objets → JSON). */
function fakeFetch(...replies) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) })
    const r = replies[Math.min(calls.length - 1, replies.length - 1)]
    const status = r?.status ?? 200
    const text = typeof r?.text === 'string' ? r.text : JSON.stringify(r?.json ?? r)
    return { ok: status < 400, status, text: async () => text }
  }
  fn.calls = calls
  return fn
}

const ollamaReply = (content) => ({ message: { role: 'assistant', content }, prompt_eval_count: 12, eval_count: 5 })
const SCHEMA = {
  type: 'object',
  required: ['conclusion'],
  properties: { conclusion: { type: 'string', enum: ['rien', 'constats'] } },
  additionalProperties: false,
}

test('isLocalUrl : la boucle locale seulement', () => {
  for (const u of ['http://127.0.0.1:11434', 'http://localhost:1234/v1', 'http://[::1]:8080', 'http://ollama.localhost', 'http://127.1.2.3'])
    assert.equal(isLocalUrl(u), true, u)
  for (const u of ['https://api.openai.com/v1', 'http://192.168.1.10:11434', 'http://10.0.0.2', 'http://127.0.0.1.example.com', 'pas une url', 'http://localhost.example.com'])
    assert.equal(isLocalUrl(u), false, u)
})

test('garde : un fournisseur distant sans --allow-remote est refusé AVANT tout appel', async () => {
  const f = fakeFetch(ollamaReply('{}'))
  const logs = []
  assert.throws(
    () => createProvider({ type: 'openai-compatible', model: 'm', baseUrl: 'https://api.example.com/v1' }, { fetch: f, log: (l) => logs.push(l) }),
    (e) => e instanceof RemoteRefusedError && e.code === 'ARCHIMETRICS_REMOTE_REFUSED' && /--allow-remote/.test(e.message),
  )
  assert.throws(() => createProvider({ type: 'ollama', model: 'm', baseUrl: 'http://192.168.1.10:11434' }, { fetch: f }), RemoteRefusedError)
  assert.throws(() => guardRemote('https://api.example.com/v1'), RemoteRefusedError)
  assert.equal(f.calls.length, 0, 'aucune requête partie')
  assert.deepEqual(logs, [])
})

test('garde : avec --allow-remote, l’appel distant est autorisé et journalisé, sans la clé', async () => {
  const f = fakeFetch({ choices: [{ message: { content: '{"conclusion":"rien"}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } })
  const logs = []
  const p = createProvider(
    { type: 'openai-compatible', model: 'm', baseUrl: 'https://api.example.com/v1', apiKeyEnv: 'CLE_TEST' },
    { allowRemote: true, fetch: f, env: { CLE_TEST: 'sk-secret' }, log: (l) => logs.push(l) },
  )
  assert.equal(p.remote, true)
  assert.equal(logs.length, 1)
  assert.match(logs[0], /appel distant autorisé \(--allow-remote\) vers api\.example\.com/)
  assert.ok(!logs[0].includes('sk-secret'))
  const r = await p.complete([{ role: 'user', content: 'x' }], { schema: SCHEMA })
  assert.equal(r.content, '{"conclusion":"rien"}')
  assert.equal(f.calls[0].init.headers.authorization, 'Bearer sk-secret')
})

test('garde : un fournisseur local ne journalise rien et n’a pas besoin de --allow-remote', () => {
  const logs = []
  const p = createProvider({ model: 'qwen' }, { fetch: fakeFetch({}), log: (l) => logs.push(l) })
  assert.equal(p.name, 'ollama')
  assert.equal(p.remote, false)
  assert.deepEqual(logs, [])
  assert.throws(() => createProvider({ type: 'inconnu', model: 'm' }), /fournisseur inconnu/)
  assert.throws(() => createProvider({ model: '' }), /model requis/)
})

test('Ollama : POST /api/chat sans flux, schéma dans format, température 0, usage relevé', async () => {
  const f = fakeFetch(ollamaReply('{"conclusion":"rien"}'))
  const p = createProvider({ model: 'qwen3:4b', baseUrl: 'http://127.0.0.1:11434/' }, { fetch: f })
  const r = await p.complete([{ role: 'user', content: 'bonjour' }], { schema: SCHEMA })
  assert.equal(f.calls[0].url, 'http://127.0.0.1:11434/api/chat')
  assert.equal(f.calls[0].init.method, 'POST')
  const b = f.calls[0].body
  assert.equal(b.model, 'qwen3:4b')
  assert.equal(b.stream, false)
  assert.deepEqual(b.format, SCHEMA)
  assert.equal(b.options.temperature, 0)
  assert.equal(b.options.seed, 42)
  assert.deepEqual(r, { content: '{"conclusion":"rien"}', usage: { input: 12, output: 5 } })
  await p.complete([{ role: 'user', content: 'x' }])
  assert.equal(f.calls[1].body.format, 'json', 'sans schéma : format json')
})

test('compatible OpenAI : POST /chat/completions, response_format json_schema, sans clé si aucune', async () => {
  const f = fakeFetch({ choices: [{ message: { content: '{}' } }] })
  const p = createProvider({ type: 'openai-compatible', model: 'local', baseUrl: 'http://127.0.0.1:1234/v1' }, { fetch: f })
  await p.complete([{ role: 'user', content: 'x' }], { schema: SCHEMA })
  assert.equal(f.calls[0].url, 'http://127.0.0.1:1234/v1/chat/completions')
  assert.equal(f.calls[0].body.response_format.type, 'json_schema')
  assert.deepEqual(f.calls[0].body.response_format.json_schema.schema, SCHEMA)
  assert.equal(f.calls[0].init.headers.authorization, undefined)
  assert.throws(() => createProvider({ type: 'openai-compatible', model: 'm', baseUrl: 'http://127.0.0.1:1/v1', apiKeyEnv: 'VIDE' }, { env: {} }), /VIDE vide/)
  assert.throws(() => createProvider({ type: 'openai-compatible', model: 'm' }), /baseUrl requis/)
})

test('erreurs du fournisseur : statut HTTP, corps illisible, réponse sans contenu', async () => {
  const p = (reply) => createProvider({ model: 'm' }, { fetch: fakeFetch(reply) })
  await assert.rejects(p({ status: 404, text: 'model not found' }).complete([]), (e) => e instanceof ProviderError && e.status === 404 && e.body === 'model not found')
  await assert.rejects(p({ text: '<html>' }).complete([]), /pas du JSON/)
  await assert.rejects(p({ message: {} }).complete([]), /sans message\.content/)
  const down = createProvider({ model: 'm' }, { fetch: async () => { throw new Error('ECONNREFUSED') } })
  await assert.rejects(down.complete([]), /appel impossible .*ECONNREFUSED/)
})

test('extractJson : clôture Markdown, raisonnement <think>, texte autour', () => {
  assert.equal(extractJson('```json\n{"a":1}\n```'), '{"a":1}')
  assert.equal(extractJson('<think>{"faux":1}</think>\nVoici : {"a":{"b":2}} fin'), '{"a":{"b":2}}')
  assert.equal(extractJson('rien'), 'rien')
})

test('completeJson : une réponse hors schéma est réessayée avec les erreurs, puis acceptée', async () => {
  const f = fakeFetch(ollamaReply('{"conclusion":"peut-être"}'), ollamaReply('```json\n{"conclusion":"rien"}\n```'))
  const p = createProvider({ model: 'm' }, { fetch: f })
  const r = await completeJson(p, [{ role: 'user', content: 'juge' }], { schema: SCHEMA })
  assert.equal(r.ok, true)
  assert.deepEqual(r.value, { conclusion: 'rien' })
  assert.equal(r.attempts.length, 2)
  assert.match(r.attempts[0].errors[0], /valeur hors de/)
  assert.deepEqual(r.attempts[1].errors, [])
  assert.deepEqual(r.usage, { input: 24, output: 10 })
  const second = f.calls[1].body.messages
  assert.equal(second.length, 3)
  assert.equal(second[1].role, 'assistant')
  assert.equal(second[1].content, '{"conclusion":"peut-être"}')
  assert.match(second[2].content, /ne respecte pas le format/)
})

test('completeJson : échec après 1 + retries essais ; contrôle de cohérence de l’appelant', async () => {
  const bad = createProvider({ model: 'm' }, { fetch: fakeFetch(ollamaReply('pas du json')) })
  const r = await completeJson(bad, [], { schema: SCHEMA, retries: 2 })
  assert.equal(r.ok, false)
  assert.equal(r.value, null)
  assert.equal(r.attempts.length, 3)
  assert.match(r.attempts[2].errors[0], /JSON illisible/)

  const f = fakeFetch(ollamaReply('{"conclusion":"constats"}'), ollamaReply('{"conclusion":"rien"}'))
  const check = (v) => (v.conclusion === 'constats' ? ['« constats » sans constat'] : [])
  const r2 = await completeJson(createProvider({ model: 'm' }, { fetch: f }), [], { schema: SCHEMA, check, retries: 0 })
  assert.equal(r2.ok, false)
  assert.deepEqual(r2.attempts[0].errors, ['« constats » sans constat'])
  await assert.rejects(completeJson(bad, [], { schema: { type: 'object', minProperties: 1 } }), /non pris en charge/)
})
