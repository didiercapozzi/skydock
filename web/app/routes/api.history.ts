import { boardHistory, getManifestPath, getOutputDir } from '@skydock/scripts'

const loader = () => Response.json({ steps: boardHistory(getManifestPath(getOutputDir())) })

export { loader }
