import { z } from 'zod'
import { remembered } from './remembered'

const TILE_SIZE = { min: 64, max: 320, step: 8, fallback: 160 }

const tileSizeSchema = z.coerce.number().int().min(TILE_SIZE.min).max(TILE_SIZE.max)

const size = remembered<number>({
  key: 'skydock.tileSize',
  fallback: TILE_SIZE.fallback,
  from: (stored) => tileSizeSchema.safeParse(stored).data ?? null
})

const setTileSize = (wanted: number) =>
  size.set(
    Math.min(
      TILE_SIZE.max,
      Math.max(TILE_SIZE.min, Math.round(wanted / TILE_SIZE.step) * TILE_SIZE.step)
    )
  )
const useTileSize = size.use

const stepTileSize = (steps: number) => setTileSize(size.read() + steps * TILE_SIZE.step)

const pictureWidthFor = (drawn: number) => (drawn <= 80 ? 160 : drawn <= 160 ? 320 : 640)

export { pictureWidthFor, setTileSize, stepTileSize, TILE_SIZE, useTileSize }
