import { readFelt } from './jumpMoments'
import { READERS, telemetryOf, VECTOR_READERS } from './telemetry'

const jumpMoments = async (clip: string, onPercent?: (percent: number) => void) => {
  const written = await telemetryOf(clip, onPercent)
  return written
    ? readFelt(
        READERS[written.kind](written.data),
        written.seconds,
        VECTOR_READERS[written.kind](written.data)
      )
    : null
}

export { jumpMoments }
