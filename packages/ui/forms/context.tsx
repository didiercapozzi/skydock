import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { useActionData, useNavigation, useSubmit, type SubmitTarget } from 'react-router'
import type { z } from 'zod'
import {
  createSchemaFields,
  extractIssues,
  getDeepValue,
  isChangeEvent,
  setDeepValue
} from './schema'
import type { FieldDescriptor, FieldPath, FormContextValue, UseFormOptions } from './types'
import { isFormError, isFormSuccess } from './guards'

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

const useForm = <TSchema extends z.ZodObject<z.ZodRawShape>>({
  schema,
  defaultValues,
  onSuccess,
  submit = useSubmit(),
  navigation = useNavigation(),
  actionData = useActionData() as unknown
}: UseFormOptions<TSchema>) => {
  type PathType = FieldPath<z.infer<TSchema>>

  const [values, setValues] = useState<z.input<TSchema>>(defaultValues)
  const [clientErrors, setClientErrors] = useState<Partial<Record<PathType, string>>>({})
  const [dismissedServerFields, setDismissedServerFields] = useState<Record<string, boolean>>({})

  const fields = createSchemaFields(schema)
  const isSubmitting = navigation.state === 'submitting' || navigation.state === 'loading'
  const lastProcessedDataRef = useRef<unknown>(undefined)

  useEffect(() => {
    if (!actionData || actionData === lastProcessedDataRef.current) return
    lastProcessedDataRef.current = actionData

    if (isFormSuccess<z.output<TSchema>>(actionData)) {
      const parsed = schema.safeParse(actionData.data)
      if (parsed.success) {
        onSuccess?.(parsed.data)
      }
    }
  }, [actionData, schema, onSuccess])

  const failedResponse = isFormError<TSchema>(actionData) ? actionData : undefined

  const serverFieldErrors = failedResponse?.fieldErrors
  const globalErrors: readonly string[] =
    failedResponse?.globalErrors && !dismissedServerFields['_global']
      ? failedResponse.globalErrors
      : []

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

    const serverErr = serverFieldErrors?.[path as PathType]
    return typeof serverErr === 'string' ? serverErr : undefined
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
    submit(clientResult.data as SubmitTarget, { method: 'post', encType: 'application/json' })
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

export { Form, FormProvider, useForm, useFormField }
