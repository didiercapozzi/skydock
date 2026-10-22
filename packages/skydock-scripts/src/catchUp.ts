import { buildMissingMoments } from './momentPass'
import { repairCutProxies } from './montageClips'
import { buildMissingProxies } from './proxy'
import { messageOf } from './lib/words'

const catchUp = async (outputDir?: string) => {
  await Promise.all([
    buildMissingProxies(outputDir)
      .catch((e: unknown) => {
        console.error('[Proxy] pass failed:', messageOf(e))
      })
      .then(() => repairCutProxies(outputDir))
      .catch((e: unknown) => {
        console.error('[Process] cutting the small copies failed:', messageOf(e))
      }),
    buildMissingMoments(outputDir).catch((e: unknown) => {
      console.error('[Moments] pass failed:', messageOf(e))
    })
  ])
}

export { catchUp }
