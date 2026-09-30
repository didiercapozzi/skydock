import { buildMissingMoments } from './momentPass'
import { buildMissingProxies } from './proxy'
import { messageOf } from './lib/words'

/* What a clip is given once it is on the board, behind whatever answered: its small copy for the
   crop bar and the editor, and where the jump is in it. Two passes side by side, each saying how far
   it has got, and neither waiting for the other — everything works without them meanwhile. Never
   rejects: a card that cannot be proxied or read is still a card that can be sorted. */
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
