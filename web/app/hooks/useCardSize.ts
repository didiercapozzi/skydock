import { z } from 'zod'
import { remembered } from './remembered'

const cardSizeSchema = z.enum(['full', 'compact', 'hidden'])
type CardSize = z.infer<typeof cardSizeSchema>

/* How much room the jump cards take above the files: whole, with frames off each jump; compact,
   a line each, so a busy day's twenty jumps do not push its files off the screen; or folded away.
   Remembered on this machine, since it is about the screen, not about the day. */
const size = remembered<CardSize>({
  key: 'skydock.cardSize',
  fallback: 'full',
  from: (stored) => cardSizeSchema.safeParse(stored).data ?? null
})

const setCardSize = size.set
const useCardSize = size.use

export { setCardSize, useCardSize }
export type { CardSize }
