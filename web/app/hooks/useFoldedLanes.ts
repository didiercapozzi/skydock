import { remembered } from './remembered'

const LANES = ['text', 'images', 'music'] as const
type Lane = (typeof LANES)[number]
type FoldedLanes = Record<Lane, boolean>

const NONE: FoldedLanes = { text: false, images: false, music: false }

const parseFolded = (stored: string): FoldedLanes | null => {
  try {
    const raw: unknown = JSON.parse(stored)
    if (typeof raw !== 'object' || raw === null) return null
    const given = raw as Record<string, unknown>
    return { text: given.text === true, images: given.images === true, music: given.music === true }
  } catch {
    return null
  }
}

const folded = remembered<FoldedLanes>({
  key: 'skydock.foldedLanes',
  fallback: NONE,
  from: parseFolded,
  to: JSON.stringify
})

const useFoldedLanes = folded.use
const setFoldedLanes = folded.set
const foldLane = (lane: Lane, on: boolean) => setFoldedLanes({ ...folded.read(), [lane]: on })

export { foldLane, NONE as NO_FOLDED_LANES, setFoldedLanes, useFoldedLanes }
export type { FoldedLanes, Lane }
