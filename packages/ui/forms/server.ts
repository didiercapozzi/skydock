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

const createFormErrorBuilder = <TSchema extends z.ZodTypeAny>(
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
    hasErrors: () => Object.keys(fieldErrors).length > 0 || globalErrors.length > 0,
    toResponse: (status: HttpStatusError = defaultStatus): FormResult<TSchema> => ({
      success: false,
      status,
      fieldErrors,
      globalErrors: globalErrors.length > 0 ? globalErrors : undefined
    })
  }

  return builder
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
  <
    TSchema extends z.ZodObject<z.ZodRawShape>,
    TResult,
    TValidationError = FormErrorResponse<TSchema>
  >(options: {
    schema: TSchema
    handler: (ctx: ValidatedContext<TActionArgs, TSchema>) => Promise<TResult> | TResult
    onValidationError?: (
      issues: readonly z.ZodIssue[]
    ) => Promise<TValidationError> | TValidationError
  }) => {
    const { schema, handler, onValidationError: customOnValidationError } = options
    const onValidationError =
      customOnValidationError ??
      ((issues: readonly z.ZodIssue[]) =>
        ({
          success: false as const,
          status: 422 as const,
          ...extractIssues<TSchema>(issues)
        }) as unknown as TValidationError)

    const action = async (args: TActionArgs) => {
      const jsonData = await args.request.clone().json()
      const parsed = deepDateSchema(schema).safeParse(jsonData)
      if (!parsed.success) {
        return (await onValidationError(parsed.error.issues)) as TValidationError
      }
      const errors = createFormErrorBuilder(schema)

      return (await handler({ ...args, data: parsed.data, errors })) as TResult
    }
    return action
  }

export { createFormErrorBuilder, createValidatedFormAction }
export type { ValidatedContext }
