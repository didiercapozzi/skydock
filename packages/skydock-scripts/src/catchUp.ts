import { buildMissingMoments } from './momentPass'
import { buildMissingProxies } from './proxy'
import { messageOf } from './lib/words'

const catchUp = async (outputDir?: string) => {
  await Promise.all([
    buildMissingProxies(outputDir).catch((e: unknown) => {
      console.error('[Proxy] pass failed:', messageOf(e))
    }),
    buildMissingMoments(outputDir).catch((e: unknown) => {
      console.error('[Moments] pass failed:', messageOf(e))
    })
  ])
}

export { catchUp }
