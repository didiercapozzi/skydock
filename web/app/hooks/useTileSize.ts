import { z } from 'zod'
import { remembered } from './remembered'

/* How big the thumbnails are drawn, remembered on this machine (RULES, The board): from a wall of
   small ones to see a whole card at once, to large ones to tell two near-identical shots apart. */
const TILE_SIZE = { min: 64, max: 320, step: 8, fallback: 160 }

const tileSizeSchema = z.coerce.number().int().min(TILE_SIZE.min).max(TILE_SIZE.max)

const size = remembered<number>({
  key: 'skydock.tileSize',
  fallback: TILE_SIZE.fallback,
  from: (stored) => tileSizeSchema.safeParse(stored).data ?? null
})

/* a size asked for, kept within what can be drawn and on the step the slider moves by */
const setTileSize = (wanted: number) =>
  size.set(
    Math.min(
      TILE_SIZE.max,
      Math.max(TILE_SIZE.min, Math.round(wanted / TILE_SIZE.step) * TILE_SIZE.step)
    )
  )
const useTileSize = size.use

/* one step bigger or smaller than now, for the wheel */
const stepTileSize = (steps: number) => setTileSize(size.read() + steps * TILE_SIZE.step)

/* The picture a thumbnail asks for: a few widths only, so the machine cuts and keeps few of them, each
   at least twice what is drawn so it stays sharp on a fine screen. */
const pictureWidthFor = (drawn: number) => (drawn <= 80 ? 160 : drawn <= 160 ? 320 : 640)

export { pictureWidthFor, setTileSize, stepTileSize, TILE_SIZE, useTileSize }
