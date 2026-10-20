import { remembered } from './remembered'

const TIMELINE_HEIGHT = { start: 320, least: 160, most: 640, step: 20 }

const resizedTimeline = (height: number) =>
  Math.min(TIMELINE_HEIGHT.most, Math.max(TIMELINE_HEIGHT.least, height))

const height = remembered<number>({
  key: 'skydock.timelineHeight',
  fallback: TIMELINE_HEIGHT.start,
  from: (stored) => (Number.isFinite(Number(stored)) ? resizedTimeline(Number(stored)) : null)
})

const setTimelineHeight = height.set
const useTimelineHeight = height.use

export { resizedTimeline, setTimelineHeight, TIMELINE_HEIGHT, useTimelineHeight }
