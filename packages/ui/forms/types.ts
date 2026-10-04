import type {
  AriaAttributes,
  ChangeEvent,
  FormEventHandler,
  InputHTMLAttributes,
  ReactNode
} from 'react'
import type { SubmitFunction } from 'react-router'
import type { z } from 'zod'

type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
type FieldChangeEvent = ChangeEvent<FieldElement>

type FieldPath<T> = T extends Date | File | Blob
  ? never
  : NonNullable<T> extends readonly (infer U)[]
    ? `${number}` | `${number}.${FieldPath<NonNullable<U>>}`
    : NonNullable<T> extends Record<string, unknown>
      ? {
          [K in keyof NonNullable<T> & string]: NonNullable<NonNullable<T>[K]> extends
            | Record<string, unknown>
            | readonly unknown[]
            ? `${K}` | `${K}.${FieldPath<NonNullable<NonNullable<T>[K]>>}`
            : `${K}`
        }[keyof NonNullable<T> & string]
      : never

type FieldDescriptor<TPath extends string = string> = {
  readonly path: TPath
}

type DeepFieldAccessor<T, Prefix extends string = ''> = FieldDescriptor<Prefix> & {
  readonly [K in keyof NonNullable<T> & string]: DeepFieldAccessor<
    NonNullable<NonNullable<T>[K]>,
    Prefix extends '' ? `${K}` : `${Prefix}.${K}`
  >
} & (NonNullable<T> extends readonly (infer U)[]
    ? {
        readonly [index: number]: DeepFieldAccessor<
          NonNullable<U>,
          Prefix extends '' ? `${number}` : `${Prefix}.${number}`
        >
      }
    : {})

type HttpStatusError = 400 | 401 | 403 | 404 | 409 | 422

type FormSuccessResponse<TData> = {
  readonly success: true
  readonly status: 200 | 201
  readonly data: TData
}

type FormErrorResponse<TSchema extends z.ZodTypeAny> = {
  readonly success: false
  readonly status: HttpStatusError
  readonly fieldErrors?: Partial<Record<FieldPath<z.infer<TSchema>>, string>>
  readonly globalErrors?: readonly string[]
}

type FormResult<TSchema extends z.ZodTypeAny> =
  | FormSuccessResponse<z.output<TSchema>>
  | FormErrorResponse<TSchema>

type FormContextValue = {
  readonly getFieldError: (field: FieldDescriptor<string>) => string | undefined
  readonly getFieldValue: (field: FieldDescriptor<string>) => unknown
  readonly setFieldValue: (field: FieldDescriptor<string>, value: unknown) => void
  readonly handleSubmit: FormEventHandler<HTMLFormElement>
  readonly isSubmitting: boolean
}

type FormFieldRenderProps = {
  readonly id: NonNullable<InputHTMLAttributes<FieldElement>['id']>
  readonly name: NonNullable<InputHTMLAttributes<FieldElement>['name']>
  readonly value: string
  readonly disabled: NonNullable<InputHTMLAttributes<FieldElement>['disabled']>
  readonly error?: string
  readonly 'aria-invalid': boolean
  readonly 'aria-describedby': AriaAttributes['aria-describedby']
  readonly onChange: (value: FieldChangeEvent | string) => void
}

type FormFieldProps = {
  readonly field: FieldDescriptor<string>
  readonly label?: string
  readonly description?: string
  readonly className?: string
  readonly children: (props: FormFieldRenderProps) => ReactNode
}

type NavigationState = 'idle' | 'submitting' | 'loading'

type UseFormOptions<TSchema extends z.ZodObject<z.ZodRawShape>> = {
  readonly schema: TSchema
  readonly defaultValues: z.input<TSchema>
  readonly onSuccess?: (data: z.output<TSchema>) => void
  readonly submit?: SubmitFunction
  readonly navigation?: { readonly state: NavigationState }
  readonly actionData?: unknown
}

export type {
  DeepFieldAccessor,
  FieldDescriptor,
  FieldPath,
  FormContextValue,
  FormErrorResponse,
  FormFieldProps,
  FormFieldRenderProps,
  FormResult,
  FormSuccessResponse,
  HttpStatusError,
  NavigationState,
  UseFormOptions
}
