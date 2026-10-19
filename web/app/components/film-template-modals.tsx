import { i18n } from '@lingui/core'
import { msg, plural, t } from '@lingui/core/macro'
import {
  applyTemplate,
  captureTemplate,
  DAY_TOKEN,
  filmTemplatesAnswerSchema,
  NAME_TOKEN
} from '@skydock/scripts/client'
import type { FilmEdit, FilmTemplate } from '@skydock/scripts/client'
import { useEffect, useState } from 'react'
import type { SubmitFunction } from 'react-router'
import { z } from 'zod'
import { Form, FormField, useForm } from '../../../packages/ui/forms'
import { routingEngine } from '../helpers/routing'
import { setFilmTemplateChoice, useFilmTemplateChoice } from '../hooks/useFilmTemplateChoice'
import { refusalSchema } from '../hooks/useBoardState'
import { useLoaded } from '../hooks/useLoaded'
import { Go, Mini } from './buttons'
import { ERROR, INPUT, Modal, Spacer } from './modal'
import { clock } from './utils'

type Call = Parameters<typeof routingEngine.action<'/api/film-templates'>>[0]['actionArgs']

const keptSchema = z.object({ name: z.string() })

const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .max(60, { error: () => i18n._(msg`Keep it under 60 characters`) })
})

const askFilmTemplates = async (call: Call) => {
  const answer = await routingEngine
    .action({ url: '/api/film-templates', actionArgs: call })
    .catch(() => null)
  const refused = refusalSchema.safeParse(answer)
  return refused.success
    ? { said: refused.data.globalErrors?.[0] ?? t`That did not work.`, name: call.name }
    : { said: null, name: keptSchema.safeParse(answer).data?.name ?? call.name }
}

const summaryOf = (template: FilmTemplate) =>
  t`${plural(template.texts.length, { one: '# text', other: '# texts' })} · ${plural(template.music.length, { one: '# piece of music', other: '# pieces of music' })} · ${clock(template.length)}`

const MissingMusic = ({ names, left }: { names: string[]; left?: 'left' | 'cut' }) => {
  const list = names.join(', ')
  return (
    names.length > 0 && (
      <span className='rounded-corner bg-local-soft px-2.5 py-1.5 text-small text-ink-2'>
        {left === 'cut'
          ? t`Does not fit this film, left out: ${list}`
          : left
            ? t`Not in the music folder, left out: ${list}`
            : t`Not in the music folder: ${list}`}
      </span>
    )
  )
}

const NameForm = ({
  initial = '',
  submitLabel,
  note,
  onSubmit,
  onCancel
}: {
  initial?: string
  submitLabel: (name: string) => string
  note?: (name: string) => React.ReactNode
  onSubmit: (name: string) => void | Promise<void>
  onCancel?: () => void
}) => {
  const [busy, setBusy] = useState(false)
  const submit: SubmitFunction = async (target) => {
    const parsed = nameSchema.safeParse(target)
    if (!parsed.success) return
    setBusy(true)
    try {
      await onSubmit(parsed.data.name)
    } finally {
      setBusy(false)
    }
  }
  const form = useForm({ schema: nameSchema, defaultValues: { name: initial }, submit })
  const typed = form.values.name.trim()
  return (
    <Form
      value={form}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onCancel) {
          e.stopPropagation()
          onCancel()
        }
      }}
      className='flex flex-wrap items-end gap-2'>
      <FormField
        field={form.fields.name}
        label={t`Name`}
        className='min-w-55 flex-1'>
        {(control) => (
          <input
            {...control}
            type='text'
            autoFocus={Boolean(onCancel)}
            className={`w-full ${INPUT}`}
          />
        )}
      </FormField>
      <Go
        type='submit'
        disabled={busy}>
        {submitLabel(typed)}
      </Go>
      {onCancel && <Mini onClick={onCancel}>{t`Cancel`}</Mini>}
      {note && <div className='basis-full'>{note(typed)}</div>}
    </Form>
  )
}

export type Listed = z.infer<typeof filmTemplatesAnswerSchema>['templates']
type Who = { name: string; day: string }

const Choice = ({
  title,
  detail,
  missing,
  picked,
  onPick
}: {
  title: string
  detail: string
  missing?: string[]
  picked: boolean
  onPick: () => void
}) => (
  <label
    className={`flex cursor-pointer flex-col gap-1 rounded-corner border px-3 py-2 ${
      picked ? 'border-accent bg-accent-soft shadow-ring' : 'border-line-2 bg-pane'
    }`}>
    <span className='flex flex-wrap items-center gap-2'>
      <input
        type='radio'
        name='film-template'
        checked={picked}
        onChange={onPick}
        className='flex-none'
      />
      <b className='text-body font-semibold text-ink'>{title}</b>
      <span className='text-small text-ink-3'>{detail}</span>
    </span>
    {missing && <MissingMusic names={missing} />}
  </label>
)

const FilmTemplatePicker = ({
  templates,
  onChoose
}: {
  templates: Listed
  onChoose: (name: string | null) => void
}) => {
  const remembered = useFilmTemplateChoice()
  const there = templates.some((one) => one.name === remembered)
  const [picked, setPicked] = useState(there ? remembered : '')
  useEffect(() => {
    if (!there) setFilmTemplateChoice('')
  }, [there])
  return (
    <Modal
      label={t`Start the film from a film template?`}
      title={t`Start the film from a film template?`}
      onClose={() => onChoose(null)}
      footer={
        <>
          <Spacer />
          <Go
            onClick={() => {
              setFilmTemplateChoice(picked)
              onChoose(picked || null)
            }}>
            {t`Start the film`}
          </Go>
        </>
      }>
      <div
        role='radiogroup'
        aria-label={t`Film templates`}
        className='flex flex-col gap-1.5'>
        <Choice
          title={t`No film template`}
          detail={t`The videos end to end, and the name as the title`}
          picked={picked === ''}
          onPick={() => setPicked('')}
        />
        {templates.map(({ name, template, missing }) => (
          <Choice
            key={name}
            title={name}
            detail={summaryOf(template)}
            missing={missing}
            picked={picked === name}
            onPick={() => setPicked(name)}
          />
        ))}
      </div>
    </Modal>
  )
}

const FilmTemplateModal = ({
  edit,
  who,
  onApply,
  onClose
}: {
  edit: FilmEdit
  who: Who
  onApply: (next: FilmEdit) => void
  onClose: () => void
}) => {
  const [again, setAgain] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [kept, setKept] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const { data, problem } = useLoaded('/api/film-templates', filmTemplatesAnswerSchema, {
    failed: t`The film templates could not be read.`,
    deps: [again]
  })
  const templates = data?.templates ?? []
  const chosen = templates.find((one) => one.name === picked)
  const result =
    chosen && data && applyTemplate(edit, chosen.template, { ...who, music: data.music })

  return (
    <Modal
      label={t`Film template`}
      title={t`Film template`}
      onClose={onClose}>
      <p className='m-0 text-body font-semibold text-ink'>{t`Start from a film template`}</p>
      {problem && <p className={`m-0 ${ERROR}`}>{problem}</p>}
      {data && templates.length === 0 && (
        <p className='m-0 text-body text-ink-3'>
          {t`No film template yet. Save this film as one below.`}
        </p>
      )}
      <div
        role='radiogroup'
        aria-label={t`Film templates`}
        className='flex flex-col gap-1.5'>
        {templates.map(({ name, template }) => (
          <Choice
            key={name}
            title={name}
            detail={summaryOf(template)}
            picked={picked === name}
            onPick={() => setPicked(name)}
          />
        ))}
      </div>
      {result && (
        <>
          <p className='m-0 text-body text-ink-2'>
            {edit.texts.length + edit.music.length === 0
              ? t`This film has no texts or music yet. Your clips stay.`
              : t`It replaces the ${plural(edit.texts.length, { one: '# text', other: '# texts' })}, the ${plural(edit.music.length, { one: '# piece of music', other: '# pieces of music' })} and the camera-sound level of this film. Your clips stay. Undo brings it back.`}
          </p>
          <MissingMusic
            names={result.left}
            left='left'
          />
          <MissingMusic
            names={result.cut}
            left='cut'
          />
        </>
      )}
      <span className='flex'>
        <Go
          disabled={!result}
          title={result ? undefined : t`Pick a film template first`}
          onClick={() => {
            if (!result) return
            onApply(result.edit)
            onClose()
          }}>
          {t`Apply`}
        </Go>
      </span>

      <p className='m-0 border-t border-line-2 pt-3 text-body font-semibold text-ink'>
        {t`Save as film template`}
      </p>
      <NameForm
        key={again}
        submitLabel={(name) =>
          templates.some((one) => one.name === name) ? t`Replace it` : t`Save`
        }
        note={(name) => (
          <>
            {templates.some((one) => one.name === name) && (
              <p
                role='status'
                className='m-0 text-small text-ink-2'>
                {t`A film template called ${name} is already there.`}
              </p>
            )}
            <p className='m-0 text-small text-ink-3'>
              {t`Keeps ${plural(edit.texts.length, { one: '# text', other: '# texts' })}, ${plural(edit.music.length, { one: '# piece of music', other: '# pieces of music' })} and the camera-sound level. The clips stay with this film.`}
            </p>
            <p className='m-0 text-small text-ink-3'>
              {t`Texts are saved as typed, apart from the passenger's name and the day, which become ${NAME_TOKEN} and ${DAY_TOKEN} and are filled in again for each film. Any other personal text stays in the film template file.`}
            </p>
          </>
        )}
        onSubmit={async (name) => {
          const { said } = await askFilmTemplates({
            intent: 'save',
            name,
            template: captureTemplate(edit, who),
            replace: templates.some((one) => one.name === name)
          })
          setRefused(said)
          setKept(said === null ? name : null)
          if (said === null) setAgain((n) => n + 1)
        }}
      />
      {kept && (
        <p
          role='status'
          className='m-0 text-small text-ink-2'>
          {t`Saved as film template ${kept}.`}
        </p>
      )}
      {refused && (
        <p
          role='alert'
          className={`m-0 ${ERROR}`}>
          {refused}
        </p>
      )}
    </Modal>
  )
}

export {
  askFilmTemplates,
  FilmTemplateModal,
  FilmTemplatePicker,
  MissingMusic,
  NameForm,
  summaryOf
}
