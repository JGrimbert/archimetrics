// LES ADAPTATEURS LLM d'archimetrics (AM-3, D-007) : local par défaut, distant seulement avec `--allow-remote`.
// Point d'entrée unique : `createProvider` (garde comprise), puis `completeJson` (sortie validée, réessai).

export { completeJson, extractJson, parseAndValidate } from './json.mjs'
export { ProviderError } from './http.mjs'
export { OLLAMA_URL } from './ollama.mjs'
export { createProvider, guardRemote, isLocalUrl, RemoteRefusedError } from './provider.mjs'
