// LE PONT VERS PYTHON : un seul processus pour tous les fichiers .py (`python_analyzer.py`, bibliothèque standard seule).
// L'interprète : $ARCHIMETRICS_PYTHON, sinon `python3`, `python`, puis `py -3` (Windows). Sans interprète, les fichiers Python
// sont comptés en lignes brutes et signalés.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'python_analyzer.py')

function candidates() {
  const env = process.env.ARCHIMETRICS_PYTHON
  const list = env ? [[env, []]] : []
  return [...list, ['python3', []], ['python', []], ['py', ['-3']]]
}

export function findPython() {
  for (const [cmd, pre] of candidates()) {
    const r = spawnSync(cmd, [...pre, '-c', 'import sys; print(sys.version_info >= (3, 9))'], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout.trim() === 'True') return [cmd, pre]
  }
  return null
}

export function analyzePython(root, rels) {
  if (!rels.length) return { results: {}, warning: null }
  const py = findPython()
  if (!py) return { results: {}, warning: 'Aucun Python 3.9+ trouvé : fichiers .py comptés en lignes brutes (définir ARCHIMETRICS_PYTHON).' }
  const dir = mkdtempSync(join(tmpdir(), 'archimetrics-'))
  const out = join(dir, 'py.json')
  try {
    const r = spawnSync(py[0], [...py[1], '-X', 'utf8', '-I', SCRIPT, out], { input: JSON.stringify({ root, files: rels }), encoding: 'utf8', maxBuffer: 1 << 28 })
    if (r.status !== 0) return { results: {}, warning: `Analyse Python en échec : ${r.stderr.slice(0, 400)}` }
    return { results: JSON.parse(readFileSync(out, 'utf8')), warning: null }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
