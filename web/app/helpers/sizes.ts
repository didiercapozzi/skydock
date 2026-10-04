import { isWholeFrame } from '@skydock/scripts'
import type { ManifestFile } from '../components/types'
import { formatSize } from '../components/utils'

type Plan = {
  size: number
  kept?: number
  frame?: ManifestFile['frame']
}

const estimatedSize = ({ size, kept = 1, frame }: Plan) => {
  const area = isWholeFrame(frame) || !frame ? 1 : Math.max(0.01, frame.width * frame.height)
  return Math.round(size * Math.min(1, Math.max(0, kept)) * area)
}

const afterNote = (file: ManifestFile, plan?: Omit<Plan, 'size'> & { unsaved?: boolean }) => {
  const source = file.processed?.source
  const current =
    source !== undefined &&
    (source.cropStart ?? null) === (file.cropStart ?? null) &&
    (source.cropEnd ?? null) === (file.cropEnd ?? null) &&
    (source.rotation ?? 0) === (file.rotation ?? 0) &&
    JSON.stringify(source.frame ?? null) === JSON.stringify(file.frame ?? null)
  const made = current && !plan?.unsaved ? file.processed?.size : undefined
  const after = made ?? estimatedSize({ size: file.size, ...plan })
  if (Math.abs(after - file.size) < Math.max(1, file.size * 0.01)) return ''
  return ` → ${made === undefined ? '~' : ''}${formatSize(after)}`
}

export { afterNote, estimatedSize }
