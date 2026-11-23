// LE VALIDATEUR DE SCHÉMA, minimal et sans dépendance : le sous-ensemble de JSON Schema (2020-12) qu'emploient les schémas
// d'archimetrics (`schemas/`) — `type` (chaîne ou liste), `enum`, `required`, `properties`, `additionalProperties`
// (booléen ou schéma), `items`. Les annotations (`title`, `description`…) sont ignorées ; tout autre mot-clé est refusé,
// pour qu'un schéma ne promette jamais une contrainte que ce validateur ne vérifierait pas.

import { readFileSync } from 'node:fs'

// Les versions des formats produits. Ajouter un champ facultatif ne les change pas ; retirer, renommer ou changer le type
// d'un champ garanti oblige à passer à `/2`. Indépendantes de l'étiquette `v1` de l'Action GitHub.
export const METRICS_SCHEMA = 'archimetrics.metrics/1'
export const DIFF_SCHEMA = 'archimetrics.metrics-diff/1'

const KEYWORDS = new Set(['type', 'enum', 'required', 'properties', 'additionalProperties', 'items'])
const ANNOTATIONS = new Set(['$schema', '$id', '$comment', 'title', 'description', 'default', 'examples'])

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const TYPES = {
  null: (v) => v === null,
  boolean: (v) => typeof v === 'boolean',
  string: (v) => typeof v === 'string',
  integer: (v) => Number.isInteger(v),
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  array: (v) => Array.isArray(v),
  object: isObject,
}

/** Lit un schéma du dossier `schemas/` d'archimetrics. */
export function loadSchema(name) {
  return JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url), 'utf8'))
}

/** Lève une erreur si le schéma emploie un mot-clé hors du sous-ensemble pris en charge. */
export function assertSupported(schema, path = '#') {
  if (typeof schema === 'boolean') return
  for (const k of Object.keys(schema)) {
    if (!KEYWORDS.has(k) && !ANNOTATIONS.has(k)) throw new Error(`${path} : mot-clé non pris en charge « ${k} »`)
  }
  for (const [k, sub] of Object.entries(schema.properties ?? {})) assertSupported(sub, `${path}/properties/${k}`)
  if (isObject(schema.additionalProperties)) assertSupported(schema.additionalProperties, `${path}/additionalProperties`)
  if (schema.items) assertSupported(schema.items, `${path}/items`)
}

function typeErrors(schema, value, path) {
  if (!schema.type) return []
  const types = [].concat(schema.type)
  return types.some((t) => TYPES[t]?.(value)) ? [] : [`${path} : type attendu ${types.join(' | ')}`]
}

function enumErrors(schema, value, path) {
  if (!schema.enum || schema.enum.some((e) => e === value)) return []
  return [`${path} : valeur hors de ${JSON.stringify(schema.enum)}`]
}

function objectErrors(schema, value, path) {
  const errors = []
  for (const k of schema.required ?? []) if (!(k in value)) errors.push(`${path} : champ requis « ${k} » absent`)
  const props = schema.properties ?? {}
  const extra = schema.additionalProperties ?? true
  for (const [k, v] of Object.entries(value)) {
    if (k in props) errors.push(...validate(props[k], v, `${path}.${k}`))
    else if (extra === false) errors.push(`${path} : champ « ${k} » non permis`)
    else if (isObject(extra)) errors.push(...validate(extra, v, `${path}.${k}`))
  }
  return errors
}

/**
 * Valide `value` contre `schema` ; rend la liste des erreurs (vide : valide). Chaque erreur nomme son chemin (`$.summary.files`).
 * @returns {string[]}
 */
export function validate(schema, value, path = '$') {
  if (schema === true) return []
  if (schema === false) return [`${path} : aucune valeur permise`]
  const head = [...typeErrors(schema, value, path), ...enumErrors(schema, value, path)]
  if (head.length) return head
  if (isObject(value)) return objectErrors(schema, value, path)
  if (Array.isArray(value) && schema.items) return value.flatMap((v, i) => validate(schema.items, v, `${path}[${i}]`))
  return []
}
