import {
  getOutputDir,
  statProcessedOutputs,
  statProxies,
  statMontageArtifacts
} from '@skydock/scripts'
import type { Manifest } from '@skydock/scripts'

const boardAnswer = async (manifest: Manifest) => {
  const grouped = new Set(manifest.groups.flatMap((g) => g.files.map((f) => f.id ?? f.path)))
  return {
    groups: manifest.groups,
    looseFiles: manifest.files.filter((f) => !grouped.has(f.id ?? f.path)),
    destinations: manifest.destinations ?? [],
    outputs: statProcessedOutputs(manifest),
    proxies: await statProxies(manifest, getOutputDir()),
    montages: await statMontageArtifacts(manifest, getOutputDir())
  }
}

export { boardAnswer }
