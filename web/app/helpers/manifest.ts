import { getOutputDir, statProcessedOutputs, statTandemArtifacts } from '@skydock/scripts'
import type { Manifest } from '@skydock/scripts'

/* Everything the board needs to redraw itself, and the only shape the server ever answers with:
   the jumps, the files belonging to no jump, what the disk says about each processed copy, and
   what each tandem's folder holds. The per-file status and the tandem's next step are computed
   from all of it, so answering with fewer leaves the board stale. */
const boardAnswer = (manifest: Manifest) => {
  const grouped = new Set(manifest.groups.flatMap((g) => g.files.map((f) => f.id ?? f.path)))
  return {
    groups: manifest.groups,
    looseFiles: manifest.files.filter((f) => !grouped.has(f.id ?? f.path)),
    destinations: manifest.destinations ?? [],
    outputs: statProcessedOutputs(manifest),
    /* nothing tells SkyDock when the editor finishes, so the film is only ever a fresh look */
    tandems: statTandemArtifacts(manifest, getOutputDir())
  }
}

export { boardAnswer }
