import { boardHistory, getManifestPath, getOutputDir } from '@skydock/scripts'

/* The board's earlier states, the latest first, to go back to one (RULES, Going back). */
const loader = () => Response.json({ steps: boardHistory(getManifestPath(getOutputDir())) })

export { loader }
