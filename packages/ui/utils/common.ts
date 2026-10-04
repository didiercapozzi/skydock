import { z } from 'zod'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/

const parseIsoDatesDeep = (value: unknown): unknown => {
  if (typeof value === 'string') {
    if (!ISO_DATE_PATTERN.test(value)) return value
    const time = Date.parse(value)
    return Number.isNaN(time) ? value : new Date(time)
  }
  if (Array.isArray(value)) return value.map((item) => parseIsoDatesDeep(item))
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) result[key] = parseIsoDatesDeep(entry)
    return result
  }
  return value
}

const deepDateSchema = <TSchema extends z.ZodType>(schema: TSchema) =>
  z.preprocess((data) => parseIsoDatesDeep(data), schema) as unknown as TSchema

export { deepDateSchema, parseIsoDatesDeep }
