import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import type { SubmitFunction } from 'react-router'
import { z } from 'zod'
import { Form, FormField, GlobalErrors, useForm } from '../../../packages/ui/forms'
import { Go, Mini } from './buttons'
import { INPUT, Modal, Spacer } from './modal'

/* a complaint said in the language the app speaks when it is made, not when this file loads */
const saying = (message: MessageDescriptor) => ({ error: () => i18n._(message) })

const connectionSchema = z.object({
  host: z
    .string()
    .min(1, saying(msg`Hostname is required`))
    .url(saying(msg`Must be a valid URL (e.g. https://nas.local:5001)`)),
  user: z
    .string()
    .min(1, saying(msg`Username is required`))
    .min(2, saying(msg`Username must be at least 2 characters`)),
  password: z
    .string()
    .min(1, saying(msg`Password is required`))
    .min(3, saying(msg`Password must be at least 3 characters`)),
  /* asked for only once the storage says the account uses 2-step verification */
  otp: z.union([z.literal(''), z.string().regex(/^\d{6}$/, saying(msg`The code is 6 digits`))])
})

/* the footer's Connect lives outside the form element, and this is how it still submits it */
const FORM_ID = 'nas-connect'

type ConnectionDialogProps = {
  onConnect: (host: string, user: string, password: string, otp?: string) => void
  onCancel: () => void
  error?: string
  /* why the storage wants the account's 2-step code, once it has asked for it */
  codeAsked?: string
}

const ConnectionDialog = ({ onConnect, onCancel, error, codeAsked }: ConnectionDialogProps) => {
  const submit: SubmitFunction = async (target) => {
    const parsed = connectionSchema.safeParse(target)
    if (!parsed.success) return
    onConnect(
      parsed.data.host,
      parsed.data.user,
      parsed.data.password,
      parsed.data.otp || undefined
    )
  }

  const form = useForm({
    schema: connectionSchema,
    defaultValues: { host: '', user: '', password: '', otp: '' },
    submit
  })

  const globalErrors = error ? [error, ...form.globalErrors] : [...form.globalErrors]

  return (
    <Modal
      data-connection-dialog='true'
      label={t`Connect to the storage`}
      title={t`Connect to the storage`}
      onClose={form.isSubmitting ? undefined : onCancel}
      footer={
        <>
          <Spacer />
          <Mini
            disabled={form.isSubmitting}
            onClick={onCancel}>
            {t`Cancel`}
          </Mini>
          <Go
            type='submit'
            form={FORM_ID}
            disabled={form.isSubmitting}>
            {form.isSubmitting ? t`Connecting…` : t`Connect`}
          </Go>
        </>
      }>
      <GlobalErrors errors={globalErrors} />
      <Form
        id={FORM_ID}
        value={form}
        className='flex flex-col gap-2.5'>
        <FormField
          field={form.fields.host}
          label={t`Storage address`}>
          {(control) => (
            <input
              {...control}
              type='text'
              placeholder='https://nas.local:5001'
              className={`w-full ${INPUT}`}
            />
          )}
        </FormField>
        <FormField
          field={form.fields.user}
          label={t`Username`}>
          {(control) => (
            <input
              {...control}
              type='text'
              placeholder='admin'
              className={`w-full ${INPUT}`}
            />
          )}
        </FormField>
        <FormField
          field={form.fields.password}
          label={t`Password`}>
          {(control) => (
            <input
              {...control}
              type='password'
              placeholder='••••••••'
              className={`w-full ${INPUT}`}
            />
          )}
        </FormField>
        {/* An account with 2-step verification: the code is asked for once, and this machine is
            then trusted by the storage, so the session renews itself without it. */}
        {codeAsked && (
          <FormField
            field={form.fields.otp}
            label={t`2-step verification code`}>
            {(control) => (
              <>
                <input
                  {...control}
                  type='text'
                  inputMode='numeric'
                  autoComplete='one-time-code'
                  maxLength={6}
                  placeholder='123456'
                  autoFocus
                  className={`w-full font-mono tracking-[0.3em] ${INPUT}`}
                />
                <span
                  role='status'
                  className='mt-1 block text-[12px] text-ink-2'>
                  {codeAsked}
                </span>
              </>
            )}
          </FormField>
        )}
      </Form>
    </Modal>
  )
}

export { ConnectionDialog, connectionSchema }
