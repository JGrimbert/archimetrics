// CE QU'UNE REVUE NE LIT PAS (AM-4) :
// - fichiers SECRETS par leur nom (`.env`, clés, `credentials.json`, `.npmrc`…) : ni leur diff ni leur contenu ne sortent ;
// - fichiers BINAIRES (diff « Binary files », extension connue) ;
// - fichiers GÉNÉRÉS : verrous de paquets, `.min.js`, cartes de source, instantanés, dossiers de code généré, et en-tête
//   dont une ligne de commentaire commence par une marque (`markIn`, la même règle que la découverte, AM-2) ;
// - diff trop volumineux pour une revue.
// Dans les fichiers lus, une LIGNE qui ressemble à un secret (clé privée, jeton GitHub, clé AWS, `password = "…"`…) est
// MASQUÉE avant toute passe LLM ; elle devient un constat déterministe, sans sa valeur.

import { markIn } from '../discover/generated.mjs'

const SECRET_FILES = [
  /(^|\/)\.env(\.(?!example$|sample$|template$|dist$)[^/]+)?$/,
  /\.(pem|key|p12|pfx|jks|keystore|asc|gpg)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/,
  /(^|\/)(credentials|secrets?|service-account)[^/]*\.(json|ya?ml|toml|ini)$/i,
  /(^|\/)\.(npmrc|pypirc|netrc|htpasswd)$/,
]
const BINARY_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|tiff?|psd|pdf|zip|gz|tgz|bz2|xz|7z|rar|jar|woff2?|ttf|otf|eot|mp[34]|wav|ogg|webm|mov|avi|wasm|exe|dll|so|dylib|bin|class|pyc|sqlite3?|db)$/i
const LOCKS = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|poetry\.lock|Pipfile\.lock|uv\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock|go\.sum)$/
const GENERATED_PATH = /(^|\/)(__generated__|generated|\.nuxt|\.next|\.output|\.svelte-kit|__snapshots__)\/|\.min\.[cm]?js$|\.min\.css$|\.map$|\.snap$/

export const MAX_FILE_DIFF = 200_000

/** Motifs de secret dans une ligne (nom, expression). Construits pour ne pas se reconnaître eux-mêmes. */
export const SECRET_PATTERNS = [
  ['clé privée', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['clé AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['jeton GitHub', /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['clé d’API (sk-…)', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}\b/],
  ['jeton Slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['clé Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['mot de passe ou clé en clair', /\b(api[_-]?key|secret|token|passw(or)?d|pwd|auth)\w*["']?\s*[:=]\s*["'][^"'\s$<>{}]{12,}["']/i],
]

/** Le nom du motif de secret que contient `line`, ou null. */
export function secretIn(line) {
  for (const [name, re] of SECRET_PATTERNS) if (re.test(line)) return name
  return null
}

/**
 * Pourquoi un fichier du diff n'est pas lu, ou null s'il l'est.
 * @param {{ path: string, binary?: boolean, diffChars?: number, head?: string | null }} f `head` : début du fichier après
 * @returns {{ raison: 'secret' | 'binaire' | 'généré' | 'volumineux', indice: string } | null}
 */
export function exclusion({ path, binary = false, diffChars = 0, head = null }) {
  if (SECRET_FILES.some((re) => re.test(path))) return { raison: 'secret', indice: 'nom de fichier sensible' }
  if (binary || BINARY_EXT.test(path)) return { raison: 'binaire', indice: binary ? 'diff binaire' : 'extension binaire' }
  if (LOCKS.test(path)) return { raison: 'généré', indice: 'verrou de paquets' }
  if (GENERATED_PATH.test(path)) return { raison: 'généré', indice: 'chemin de code généré ou minifié' }
  const mark = head ? markIn(head.slice(0, 600)) : null
  if (mark) return { raison: 'généré', indice: `en-tête : « ${mark} »` }
  if (diffChars > MAX_FILE_DIFF) return { raison: 'volumineux', indice: `diff de ${diffChars} caractères (> ${MAX_FILE_DIFF})` }
  return null
}

/**
 * Masque les lignes de secret d'un fichier du diff (en place) ; rend les lignes masquées `{ kind, line, motif }`.
 * @param {import('./diff.mjs').FileDiff} f
 */
export function redactSecrets(f) {
  const found = []
  for (const h of f.hunks) {
    for (const l of h.lines) {
      const motif = secretIn(l.text)
      if (!motif) continue
      found.push({ kind: l.kind, line: l.kind === '-' ? l.oldLine : l.newLine, motif })
      l.text = `[secret masqué : ${motif}]`
    }
  }
  return found
}
