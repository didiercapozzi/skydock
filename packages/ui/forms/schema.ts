import type { ChangeEvent } from 'react'
import type { z } from 'zod'
import type { DeepFieldAccessor, FieldPath } from './types'

const buildProxy = <T, Prefix extends string = ''>(prefix: Prefix) => {
  const handler: ProxyHandler<{ readonly path: Prefix }> = {
    get(target, prop) {
      if (prop === 'path') return target.path
      if (typeof prop === 'string') {
        return buildProxy(prefix.length > 0 ? `${prefix}.${prop}` : prop)
      }
      return Reflect.get(target, prop)
    }
  }

  return new Proxy({ path: prefix }, handler) as DeepFieldAccessor<T, Prefix>
}

const createSchemaFields = <TSchema extends z.ZodType>(_schema: TSchema) =>
  buildProxy<z.output<TSchema>, ''>('')

const getDeepValue = (target: unknown, path: string) =>
  path
    .split('.')
    .reduce<unknown>(
      (current, segment) =>
        typeof current === 'object' && current !== null ? Reflect.get(current, segment) : undefined,
      target
    )

const setDeepValue = <T extends Record<string, unknown>>(
  target: T,
  path: string,
  value: unknown
) => {
  const segments = path.split('.')
  const update = (current: unknown, index: number): unknown => {
    if (index >= segments.length) return value
    const key = segments[index]
    if (key === undefined) return current

    const isArrayKey = /^\d+$/.test(key)
    const nextVal = update(
      typeof current === 'object' && current !== null ? Reflect.get(current, key) : undefined,
      index + 1
    )

    if (isArrayKey) {
      const arr = Array.isArray(current) ? [...current] : []
      arr[Number(key)] = nextVal
      return arr
    }

    const obj =
      typeof current === 'object' && current !== null && !Array.isArray(current)
        ? { ...current }
        : {}
    return Object.assign(obj, { [key]: nextVal })
  }

  const updated = update(target, 0)
  return typeof updated === 'object' && updated !== null
    ? Object.assign({}, target, updated)
    : target
}

const extractIssues = <TSchema extends z.ZodTypeAny>(issues: readonly z.ZodIssue[]) => {
  const fieldErrors: Partial<Record<FieldPath<z.infer<TSchema>>, string>> = {}
  const globalErrors: string[] = []

  for (const issue of issues) {
    const dotPath = issue.path.join('.')
    if (dotPath.length === 0) {
      globalErrors.push(issue.message)
    } else if (!Object.prototype.hasOwnProperty.call(fieldErrors, dotPath)) {
      Reflect.set(fieldErrors, dotPath, issue.message)
    }
  }

  return {
    fieldErrors,
    globalErrors: globalErrors.length > 0 ? globalErrors : undefined
  }
}

const isChangeEvent = (
  value: unknown
): value is ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> =>
  typeof value === 'object' && value !== null && 'target' in value

export { createSchemaFields, extractIssues, getDeepValue, isChangeEvent, setDeepValue }
