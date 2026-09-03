import { z } from 'zod'
import { deepDateSchema } from '../utils/common'
import { createSchemaFields, extractIssues } from './schema'
import type {
  FieldDescriptor,
  FieldPath,
  FormErrorResponse,
  FormResult,
  HttpStatusError
} from './types'

const createFormErrorBuilder = <TSchema extends z.ZodType>(
  schema: TSchema,
  defaultStatus: HttpStatusError = 422
) => {
  type PathType = FieldPath<z.infer<TSchema>>
  const fieldErrors: Partial<Record<PathType, string>> = {}
  const globalErrors: string[] = []

  const builder = {
    fields: createSchemaFields(schema),
    addFieldError: (field: PathType | FieldDescriptor<string>, message: string) => {
      const resolvedPath = typeof field === 'string' ? field : field.path
      Reflect.set(fieldErrors, resolvedPath, message)
      return builder
    },
    addGlobalError: (message: string) => {
      globalErrors.push(message)
      return builder
    },
    hasErrors: (): boolean => Object.keys(fieldErrors).length > 0 || globalErrors.length > 0,
    toResponse: (status: HttpStatusError = defaultStatus): FormResult<TSchema> => ({
      success: false,
      status,
      fieldErrors,
      globalErrors: globalErrors.length > 0 ? globalErrors : undefined
    })
  }

  return builder
}

const validateServerData = <TSchema extends z.ZodType>(
  schema: TSchema,
  rawData: unknown
): { readonly success: true; readonly data: z.output<TSchema> } | FormErrorResponse<TSchema> => {
  const result = schema.safeParse(rawData)
  if (!result.success) {
    return {
      success: false,
      status: 422 as const,
      ...extractIssues<TSchema>(result.error.issues)
    }
  }
  return { success: true, data: result.data }
}

const formErrorResponse = <TSchema extends z.ZodType>(
  issues: readonly z.ZodIssue[],
  status: HttpStatusError = 422
): FormErrorResponse<TSchema> => ({
  success: false,
  status,
  ...extractIssues<TSchema>(issues)
})

const createFormAction = <
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TResult,
  TValidationError = FormErrorResponse<TSchema>
>(
  schema: TSchema,
  handler: (
    data: z.output<TSchema>,
    context: { readonly request: Request }
  ) => Promise<TResult> | TResult,
  options?: {
    readonly onValidationError?: (
      issues: readonly z.ZodIssue[]
    ) => Promise<TValidationError> | TValidationError
  }
) => {
  const onValidationError: (
    issues: readonly z.ZodIssue[]
  ) => Promise<TValidationError> | TValidationError =
    options?.onValidationError ??
    ((issues: readonly z.ZodIssue[]) =>
      formErrorResponse<TSchema>(issues) as unknown as TValidationError)

  return async ({
    request
  }: {
    readonly request: Request
  }): Promise<TResult | TValidationError> => {
    const jsonData = await request.json()
    const parsed = deepDateSchema(schema).safeParse(jsonData)
    if (!parsed.success) {
      return (await onValidationError(parsed.error.issues)) as TValidationError
    }
    return (await handler(parsed.data, { request })) as TResult
  }
}

type ValidatedContext<
  TActionArgs extends { request: Request },
  TSchema extends z.ZodObject<z.ZodRawShape>
> = {
  data: z.output<TSchema>
  errors: ReturnType<typeof createFormErrorBuilder<TSchema>>
} & TActionArgs

const createValidatedFormAction =
  <TActionArgs extends { request: Request }>() =>
  <TSchema extends z.ZodObject<z.ZodRawShape>, TResult = unknown>(options: {
    schema: TSchema
    handler: (
      ctx: ValidatedContext<TActionArgs, TSchema>
    ) => Promise<TResult | FormErrorResponse<TSchema>> | TResult | FormErrorResponse<TSchema>
  }): ((args: TActionArgs) => Promise<TResult | FormErrorResponse<TSchema>>) => {
    const { schema, handler } = options
    const action = async (args: TActionArgs): Promise<TResult | FormErrorResponse<TSchema>> => {
      let data: z.output<TSchema>
      try {
        const jsonData = await args.request.clone().json()
        data = deepDateSchema(schema).parse(jsonData)
      } catch (error) {
        if (error instanceof z.ZodError) {
          return formErrorResponse<TSchema>(error.issues)
        }
        throw error
      }
      const errors = createFormErrorBuilder(schema)
      return handler({ ...args, data, errors })
    }
    return action
  }

export {
  createFormAction,
  createFormErrorBuilder,
  createValidatedFormAction,
  formErrorResponse,
  validateServerData
}
export type { ValidatedContext }
