import { statProcessedOutputs } from '@skydock/scripts'
import type { Manifest } from '@skydock/scripts'

/* Everything the board needs to redraw itself, and the only shape the server ever answers with:
   the jumps, the files belonging to no jump, and what the disk says about each processed copy.
   The per-file status is computed from all three, so answering with fewer leaves it stale. */
const boardAnswer = (manifest: Manifest) => {
  const grouped = new Set(manifest.groups.flatMap((g) => g.files.map((f) => f.id ?? f.path)))
  return {
    groups: manifest.groups,
    looseFiles: manifest.files.filter((f) => !grouped.has(f.id ?? f.path)),
    destinations: manifest.destinations ?? [],
    outputs: statProcessedOutputs(manifest)
  }
}

export { boardAnswer }
