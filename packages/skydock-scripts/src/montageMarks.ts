import { z } from 'zod'
import { MOMENTS } from './moments'
import type { JumpMoments } from './types'

const markSchema = z.object({
  comment: z.string(),
  duration: z.number(),
  pos: z.number(),
  type: z.number()
})

type Mark = z.infer<typeof markSchema>

const marksFor = ({
  moments,
  cropStart,
  length,
  fps
}: {
  moments?: JumpMoments | null
  cropStart?: number | null
  length: number
  fps: number
}) => {
  if (!moments || length < 1) return [] as Mark[]
  const at = (second: number) => Math.round((second - (cropStart ?? 0)) * fps)
  return MOMENTS.flatMap(({ which, name: comment }) => {
    const second = moments[which]
    const pos = second === undefined ? -1 : at(second)
    return second === undefined || pos < 0 || pos >= length
      ? []
      : [{ comment, duration: 0, pos, type: 0 }]
  })
}

export { marksFor }
export type { Mark }
