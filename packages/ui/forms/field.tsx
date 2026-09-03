import type { FormFieldProps } from './types'
import { useFormField } from './context'

const FormField = ({ field, label, description, className, children }: FormFieldProps) => {
  const formField = useFormField(field)
  const errorId = formField.error ? `${formField.id}-error` : undefined
  const descriptionId = description ? `${formField.id}-desc` : undefined

  return (
    <div className={['flex flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      {label ? (
        <label
          htmlFor={formField.id}
          className='text-sm font-medium text-foreground'>
          {label}
        </label>
      ) : null}
      {children({
        id: formField.id,
        name: formField.name,
        value: formField.value,
        disabled: formField.disabled,
        error: formField.error,
        'aria-invalid': formField.error !== undefined,
        'aria-describedby': errorId ?? descriptionId,
        onChange: formField.onChange
      })}
      {description && !formField.error ? (
        <p
          id={descriptionId}
          className='text-xs text-muted-foreground'>
          {description}
        </p>
      ) : null}
      {formField.error ? (
        <span
          id={errorId}
          className='text-xs font-medium text-destructive'
          role='alert'>
          {formField.error}
        </span>
      ) : null}
    </div>
  )
}

export { FormField }
