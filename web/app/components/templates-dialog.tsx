import { i18n } from '@lingui/core'
import { msg, plural, t } from '@lingui/core/macro'
import { useRef, useState } from 'react'
import type { SubmitFunction } from 'react-router'
import { z } from 'zod'
import { templatesAnswerSchema } from '../../../packages/skydock-scripts/src/templateEntry'
import type { TemplateFact } from '../../../packages/skydock-scripts/src/templateEntry'
import { Form, FormField, useForm } from '../../../packages/ui/forms'
import { useLoaded } from '../hooks/useLoaded'
import { routingEngine } from '../helpers/routing'
import { setTemplateChoice, useTemplateChoice } from '../hooks/useTemplateChoice'
import { Go, Mini } from './buttons'
import { INPUT, Modal, Spacer } from './modal'

const importAnswerSchema = z.union([
  templatesAnswerSchema.extend({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() })
])

/* the complaint is said in the language the app speaks when it is made, not when this file loads */
const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .max(60, { error: () => i18n._(msg`Keep it under 60 characters`) })
})

const short = (version: string | null) => /\d+\.\d+(\.\d+)?/.exec(version ?? '')?.[0] ?? null

const TemplateRow = ({
  template,
  picked,
  onPick,
  onUsual
}: {
  template: TemplateFact
  /* absent when the templates are only being looked at, not chosen between */
  picked?: boolean
  onPick?: () => void
  /* absent while a template is being brought in, when nothing is settled */
  onUsual?: () => void
}) => {
  const made = short(template.version)
  const missing = template.missing.join(', ')
  return (
    <div
      className={`flex flex-col gap-1 rounded-corner border px-3 py-2 ${
        picked ? 'border-accent bg-accent-soft shadow-ring' : 'border-line-2 bg-pane'
      }`}>
      {/* the row picks the template; saying which one is the usual is its own thing to press, so it
          sits beside the label rather than inside it, where pressing it would pick as well */}
      <span className='flex flex-wrap items-center gap-2'>
        <label className={`flex flex-wrap items-center gap-2 ${onPick ? 'cursor-pointer' : ''}`}>
          {onPick && (
            <input
              type='radio'
              name='template'
              checked={Boolean(picked)}
              onChange={onPick}
              className='flex-none'
            />
          )}
          <b className='text-body font-semibold text-ink'>{template.name}</b>
          <span className='text-small text-ink-3'>
            {made ? `kdenlive ${made}` : t`kdenlive version not said`} ·{' '}
            {plural(template.assets, { one: '# file', other: '# files' })}
          </span>
          {template.missing.length === 0 && template.assets > 0 && (
            <span className='inline-flex h-5 items-center rounded-corner bg-up-soft px-1.75 text-micro font-bold text-up'>
              {t`every file here`}
            </span>
          )}
        </label>
        {template.byDefault && (
          <span className='inline-flex h-5 items-center rounded-corner bg-accent-soft px-1.75 text-micro font-bold text-accent-ink'>
            {t`the usual one`}
          </span>
        )}
        {onUsual && (
          <Mini onClick={onUsual}>
            {template.byDefault ? t`Stop using by default` : t`Use by default`}
          </Mini>
        )}
      </span>
      {template.missing.length > 0 && (
        <span className='rounded-corner bg-local-soft px-2.5 py-1.5 text-small text-ink-2'>
          {plural(template.missing.length, {
            one: `# file it uses is not here: ${missing}. The edit can start without it, with a hole where each belongs.`,
            other: `# files it uses are not here: ${missing}. The edit can start without them, with a hole where each belongs.`
          })}
        </span>
      )}
    </div>
  )
}

/* The editing templates: looked over, added to, and — when a montage is waiting for its editing project —
   chosen between. A template is somebody's branding, so nothing is applied by itself unless
   somebody said which one is the usual; otherwise the one picked last time is only the one already
   ticked. */
const TemplatesDialog = ({
  who,
  onClose,
  onChoose
}: {
  /* the passenger whose montage this is for; absent when the templates are only being managed */
  who?: string
  onClose: () => void
  onChoose?: (template: string) => void
}) => {
  const [bringing, setBringing] = useState<string | null>(null)
  const [pickedHere, setPickedHere] = useState<string | null>(null)
  const remembered = useTemplateChoice()
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const {
    data: answer,
    problem,
    setData: setAnswer,
    setProblem
  } = useLoaded('/api/templates', templatesAnswerSchema, {
    failed: t`The templates could not be read.`
  })

  const sendOff = async (body: FormData, done?: () => void) => {
    try {
      const parsed = importAnswerSchema.safeParse(
        await routingEngine.upload({ url: '/api/templates', body })
      )
      if (!parsed.success) setProblem(t`The templates could not be read.`)
      else if (!parsed.data.ok) setProblem(parsed.data.error)
      else {
        setAnswer({ templates: parsed.data.templates })
        done?.()
      }
    } catch {
      setProblem(t`The copy was cut off — try again.`)
    }
  }

  /* picking is what brings it in; the form only holds the name it is to have */
  const submit: SubmitFunction = async () => {
    folderInput.current?.click()
  }
  const form = useForm({ schema: nameSchema, defaultValues: { name: '' }, submit })

  /* Everything that makes one template, handed over together: the project and the files it uses.
     They are its own from then on — the project is rewritten to say where each of them is. */
  const bringIn = async (files: File[]) => {
    setProblem(null)
    setBringing(files.map((f) => f.name).join(', '))
    const body = new FormData()
    const name = nameSchema.safeParse(form.values)
    if (name.success && name.data.name) body.set('name', name.data.name)
    /* the way down from the folder, when one was chosen, so what is laid out here keeps the shape
       its owner gave it — `images/logo.png` stays `images/logo.png` */
    for (const file of files) body.append('files', file, file.webkitRelativePath || file.name)
    await sendOff(body, () => form.setFieldValue(form.fields.name, ''))
    setBringing(null)
  }

  /* Which one is the usual, or none when the one that was is said again. */
  const makeItTheUsual = async (template: TemplateFact) => {
    const body = new FormData()
    body.set('byDefault', template.byDefault ? '' : template.name)
    await sendOff(body)
  }

  const templates = answer?.templates ?? []
  const names = templates.map((template) => template.name)
  /* the one ticked: picked here, else the one picked last time, else the only one there is */
  const picked =
    pickedHere && names.includes(pickedHere)
      ? pickedHere
      : names.includes(remembered)
        ? remembered
        : names.length === 1
          ? (names[0] ?? null)
          : null

  return (
    <Modal
      label={t`Editing templates`}
      title={who ? t`A template for ${who}’s montage` : t`Editing templates`}
      wide
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
          {onChoose && (
            <Go
              disabled={!picked}
              title={picked ? undefined : t`Choose a template first`}
              onClick={() => {
                if (!picked) return
                setTemplateChoice(picked)
                onChoose(picked)
              }}>
              {t`Make the montage`}
            </Go>
          )}
        </>
      }>
      {!answer && !problem && (
        <p className='m-0 text-body text-ink-3'>{t`Reading the templates…`}</p>
      )}
      {answer && templates.length === 0 && (
        <p className='m-0 rounded-corner border border-dashed border-line-2 px-3 py-4 text-center text-body text-ink-3'>
          {t`No template yet — bring one in below.`}
        </p>
      )}
      <div
        role={onChoose ? 'radiogroup' : undefined}
        aria-label={t`Templates`}
        className='flex flex-col gap-1.5'>
        {templates.map((template) => (
          <TemplateRow
            key={template.name}
            template={template}
            picked={onChoose ? template.name === picked : undefined}
            onPick={onChoose ? () => setPickedHere(template.name) : undefined}
            onUsual={bringing ? undefined : () => void makeItTheUsual(template)}
          />
        ))}
      </div>
      {problem && (
        <p
          role='alert'
          className='m-0 rounded-corner bg-local-soft px-3 py-2 text-body text-local'>
          {problem}
        </p>
      )}

      <section className='flex flex-col gap-2 rounded-corner border border-line-2 bg-well px-3 py-2.5'>
        <h4 className='m-0 text-micro font-bold text-ink-3'>{t`Bring a template in`}</h4>
        <p className='m-0 text-small text-ink-2'>
          <b>{t`The folder kdenlive left`}</b>{' '}
          {t`— Project › Archive project, which writes the project with its`} <i>images</i> {t`and`}{' '}
          <i>sounds</i>{' '}
          {t`beside it — chosen whole. Or the one archive, if it was packed as .zip or .tar.gz. Or the project and its files picked one by one. Each file the project names is pointed at the copy brought in with it, so a template made on another machine finds its own files here. Bringing one in under a name already there replaces it, files and all.`}
        </p>
        <Form
          value={form}
          className='flex flex-wrap items-end gap-2'>
          <FormField
            field={form.fields.name}
            label={t`Name`}
            description={t`Leave it empty to name it after the project`}
            className='min-w-55 flex-1'>
            {(control) => (
              <input
                {...control}
                type='text'
                className={`w-full ${INPUT}`}
              />
            )}
          </FormField>
          <Go
            type='submit'
            disabled={bringing !== null}>
            {bringing ? t`Bringing in ${bringing}…` : t`Choose the folder…`}
          </Go>
          <Mini
            disabled={bringing !== null}
            onClick={() => fileInput.current?.click()}>
            {t`Choose files instead…`}
          </Mini>
        </Form>
        {/* Two ways in, because a browser will offer a folder or files but never both at once. What
            comes off a folder carries each file's way down from it, which is how the project names
            them and how they are laid out again here. */}
        <input
          ref={folderInput}
          type='file'
          multiple
          // @ts-expect-error — the attribute that lets a folder be chosen, which React has no type for
          webkitdirectory=''
          aria-label={t`The folder kdenlive left`}
          className='hidden'
          onChange={(e) => {
            const chosen = [...(e.target.files ?? [])]
            e.target.value = ''
            if (chosen.length > 0) void bringIn(chosen)
          }}
        />
        <input
          ref={fileInput}
          type='file'
          multiple
          aria-label={t`The template and its files`}
          className='hidden'
          onChange={(e) => {
            const chosen = [...(e.target.files ?? [])]
            e.target.value = ''
            if (chosen.length > 0) void bringIn(chosen)
          }}
        />
      </section>
    </Modal>
  )
}

export { TemplatesDialog }
