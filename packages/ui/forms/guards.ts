import type { z } from 'zod'
import type { FormErrorResponse, FormSuccessResponse } from './types'

const isFormSuccess = <TData>(value: unknown): value is FormSuccessResponse<TData> =>
  typeof value === 'object' && value !== null && Reflect.get(value, 'success') === true

const isFormError = <TSchema extends z.ZodTypeAny>(
  value: unknown
): value is FormErrorResponse<TSchema> =>
  typeof value === 'object' && value !== null && Reflect.get(value, 'success') === false

export { isFormError, isFormSuccess }
