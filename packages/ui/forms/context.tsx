import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import type { z } from 'zod'
import {
  createSchemaFields,
  extractIssues,
  getDeepValue,
  isChangeEvent,
  setDeepValue
} from './schema'
import type { FieldDescriptor, FieldPath, FormContextValue, UseFormOptions } from './types'

const FormContext = createContext<FormContextValue | null>(null)

const FormProvider = ({
  children,
  value
}: {
  readonly children: ReactNode
  readonly value: FormContextValue
}) => <FormContext.Provider value={value}>{children}</FormContext.Provider>

type FormProps = {
  readonly children: ReactNode
  readonly value: FormContextValue
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
    readonly onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  }

const Form = ({ children, value, onSubmit, noValidate = true, ...props }: FormProps) => (
  <FormContext.Provider value={value}>
    <form
      onSubmit={onSubmit ?? value.handleSubmit}
      noValidate={noValidate}
      {...props}>
      {children}
    </form>
  </FormContext.Provider>
)

const useForm = <
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TFetcher extends { readonly data?: unknown; readonly state: 'idle' | 'submitting' | 'loading' } =
    { readonly data?: unknown; readonly state: 'idle' | 'submitting' | 'loading' }
>({
  schema,
  defaultValues,
  fetcher,
  onSuccess
}: UseFormOptions<TSchema, TFetcher>) => {
  type PathType = FieldPath<z.infer<TSchema>>

  const [values, setValues] = useState<z.input<TSchema>>(defaultValues)
  const [clientErrors, setClientErrors] = useState<Partial<Record<PathType, string>>>({})
  const [dismissedServerFields, setDismissedServerFields] = useState<Record<string, boolean>>({})

  const fields = createSchemaFields(schema)
  const isSubmitting = fetcher.state === 'submitting' || fetcher.state === 'loading'
  const lastProcessedDataRef = useRef<unknown>(undefined)

  useEffect(() => {
    if (!fetcher.data || fetcher.data === lastProcessedDataRef.current) return
    lastProcessedDataRef.current = fetcher.data

    if (
      typeof fetcher.data === 'object' &&
      fetcher.data !== null &&
      Reflect.get(fetcher.data, 'success') === true
    ) {
      const parsed = schema.safeParse(Reflect.get(fetcher.data, 'data'))
      if (parsed.success) {
        onSuccess?.(parsed.data)
      }
    }
  }, [fetcher.data, schema, onSuccess])

  const isFailedResponse =
    typeof fetcher.data === 'object' &&
    fetcher.data !== null &&
    Reflect.get(fetcher.data, 'success') === false

  const serverFieldErrors = isFailedResponse ? Reflect.get(fetcher.data, 'fieldErrors') : undefined
  const rawGlobalErrors = isFailedResponse ? Reflect.get(fetcher.data, 'globalErrors') : undefined
  const globalErrors: readonly string[] =
    Array.isArray(rawGlobalErrors) && !dismissedServerFields['_global'] ? rawGlobalErrors : []

  const setFieldValue = (field: string | FieldDescriptor<string>, value: unknown) => {
    const path = typeof field === 'string' ? field : field.path
    setValues((prev) => setDeepValue(prev, path, value))
    setDismissedServerFields((prev) => (prev[path] ? prev : { ...prev, [path]: true }))
    setClientErrors((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, path)) return prev
      const next: Partial<Record<PathType, string>> = {}
      for (const [key, val] of Object.entries(prev)) {
        if (key !== path && typeof val === 'string') {
          Reflect.set(next, key, val)
        }
      }
      return next
    })
  }

  const getFieldValue = (field: string | FieldDescriptor<string>): unknown =>
    getDeepValue(values, typeof field === 'string' ? field : field.path)

  const getFieldError = (field: string | FieldDescriptor<string>): string | undefined => {
    const path = typeof field === 'string' ? field : field.path
    const clientErr = Reflect.get(clientErrors, path)
    if (typeof clientErr === 'string') return clientErr
    if (dismissedServerFields[path]) return undefined

    if (typeof serverFieldErrors === 'object' && serverFieldErrors !== null) {
      const serverErr = Reflect.get(serverFieldErrors, path)
      if (typeof serverErr === 'string') return serverErr
    }
    return undefined
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setDismissedServerFields({})

    const clientResult = schema.safeParse(values)
    if (!clientResult.success) {
      setClientErrors(extractIssues<TSchema>(clientResult.error.issues).fieldErrors)
      return
    }

    setClientErrors({})
    if ('submit' in fetcher && typeof fetcher.submit === 'function') {
      ;(fetcher.submit as unknown as (data: unknown) => void)(clientResult.data)
    }
  }

  return {
    fields,
    values,
    isSubmitting,
    globalErrors,
    setFieldValue,
    getFieldValue,
    getFieldError,
    handleSubmit
  }
}

const useFormField = (field: FieldDescriptor<string>) => {
  const context = useContext(FormContext)
  if (!context) {
    throw new Error('useFormField must be used within a FormProvider')
  }

  const id = useId()
  const rawValue = context.getFieldValue(field)
  const value =
    typeof rawValue === 'string' ? rawValue : typeof rawValue === 'number' ? `${rawValue}` : ''

  const onChange = (
    valueOrEvent: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> | string
  ) => {
    const nextValue = isChangeEvent(valueOrEvent) ? valueOrEvent.target.value : valueOrEvent
    context.setFieldValue(field, nextValue)
  }

  return {
    id,
    name: field.path,
    value,
    error: context.getFieldError(field),
    disabled: context.isSubmitting,
    onChange
  }
}

export { Form, FormContext, FormProvider, useForm, useFormField }
