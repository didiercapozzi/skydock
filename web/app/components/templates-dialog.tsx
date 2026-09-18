import { useEffect, useRef, useState } from 'react'
import type { SubmitFunction } from 'react-router'
import { z } from 'zod'
import { templatesAnswerSchema } from '../../../packages/skydock-scripts/src/templateEntry'
import type {
  TemplateFact,
  TemplatesAnswer
} from '../../../packages/skydock-scripts/src/templateEntry'
import { Form, FormField, useForm } from '../../../packages/ui/forms'
import { routingEngine } from '../helpers/routing'
import { setTemplateChoice, useTemplateChoice } from '../hooks/useTemplateChoice'
import { Go, Mini } from './buttons'
import { INPUT, Modal, Spacer } from './modal'
import { plural } from './utils'

const importAnswerSchema = z.union([
  templatesAnswerSchema.extend({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() })
])

const nameSchema = z.object({ name: z.string().trim().max(60, 'Keep it under 60 characters') })

/* what the kdenlive that wrote a template means for the one that will open it */
const GAP = {
  newer: (made: string, opens: string) =>
    `Made with kdenlive ${made}, newer than the ${opens} that will open it — it may refuse the project, or open it with pieces missing.`,
  older: (made: string, opens: string) =>
    `Made with kdenlive ${made}; kdenlive ${opens} will convert it on opening — look it over before editing on it.`
}

const short = (version: string | null) => /\d+\.\d+(\.\d+)?/.exec(version ?? '')?.[0] ?? null

const TemplateRow = ({
  template,
  editorVersion,
  picked,
  onPick
}: {
  template: TemplateFact
  editorVersion: string | null
  /* absent when the templates are only being looked at, not chosen between */
  picked?: boolean
  onPick?: () => void
}) => {
  const made = short(template.version)
  const opens = short(editorVersion)
  return (
    <label
      className={`flex flex-col gap-1 rounded-lg border px-3 py-2 ${
        picked ? 'border-accent bg-accent-soft' : 'border-line bg-ground'
      } ${onPick ? 'cursor-pointer' : ''}`}>
      <span className='flex flex-wrap items-center gap-2'>
        {onPick && (
          <input
            type='radio'
            name='template'
            checked={Boolean(picked)}
            onChange={onPick}
            className='flex-none'
          />
        )}
        <b className='text-[13px] font-semibold text-ink'>{template.name}</b>
        <span className='text-[12px] text-ink-3'>
          {made ? `kdenlive ${made}` : 'kdenlive version not said'} ·{' '}
          {plural(template.assets, 'file')}
        </span>
        {template.missing.length === 0 && template.assets > 0 && (
          <span className='rounded-full bg-up-soft px-2 py-px text-[11px] font-semibold text-up'>
            every file here
          </span>
        )}
      </span>
      {template.missing.length > 0 && (
        <span className='rounded-r-md border-l-[3px] border-local bg-local-soft px-2.5 py-1.5 text-[12px] text-ink-2'>
          {plural(template.missing.length, 'file')} it uses{' '}
          {template.missing.length === 1 ? 'is' : 'are'} not here: {template.missing.join(', ')}.
          The edit can start without {template.missing.length === 1 ? 'it' : 'them'}, with a hole
          where each belongs.
        </span>
      )}
      {template.gap && made && opens && (
        <span className='rounded-r-md border-l-[3px] border-changed bg-changed-soft px-2.5 py-1.5 text-[12px] text-ink-2'>
          {GAP[template.gap](made, opens)}
        </span>
      )}
    </label>
  )
}

/* The editing templates: looked over, added to, and — when a tandem is waiting for its montage —
   chosen between. A template is somebody's branding, so with several there is never a default
   applied by itself; the one picked last time is only the one already ticked. */
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
  const [answer, setAnswer] = useState<TemplatesAnswer | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [bringing, setBringing] = useState<string | null>(null)
  const [pickedHere, setPickedHere] = useState<string | null>(null)
  const remembered = useTemplateChoice()
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    routingEngine
      .loader({ url: '/api/templates' })
      .then((raw) => {
        const parsed = templatesAnswerSchema.safeParse(raw)
        if (cancelled) return
        if (parsed.success) setAnswer(parsed.data)
        else setProblem('The templates could not be read.')
      })
      .catch(() => {
        if (!cancelled) setProblem('The templates could not be read.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  /* picking a file is what brings it in; the form only holds the name it is to have */
  const submit: SubmitFunction = async () => {
    fileInput.current?.click()
  }
  const form = useForm({ schema: nameSchema, defaultValues: { name: '' }, submit })

  const bringIn = async (file: File) => {
    setProblem(null)
    setBringing(file.name)
    const params = new URLSearchParams({ filename: file.name })
    const name = nameSchema.safeParse(form.values)
    if (name.success && name.data.name) params.set('name', name.data.name)
    try {
      const res = await fetch(
        `${routingEngine.href({ url: '/api/templates' })}?${params.toString()}`,
        { method: 'POST', body: file }
      )
      const parsed = importAnswerSchema.safeParse(await res.json())
      if (!parsed.success) setProblem('The template could not be brought in.')
      else if (!parsed.data.ok) setProblem(parsed.data.error)
      else {
        setAnswer({ templates: parsed.data.templates, editorVersion: parsed.data.editorVersion })
        form.setFieldValue(form.fields.name, '')
      }
    } catch {
      setProblem('The copy was cut off — try again.')
    }
    setBringing(null)
  }

  const templates = answer?.templates ?? []
  const names = templates.map((t) => t.name)
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
      label='Editing templates'
      title={who ? `A template for ${who}’s montage` : 'Editing templates'}
      wide
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>Close</Mini>
          {onChoose && (
            <Go
              disabled={!picked}
              title={picked ? undefined : 'Choose a template first'}
              onClick={() => {
                if (!picked) return
                setTemplateChoice(picked)
                onChoose(picked)
              }}>
              Make the montage
            </Go>
          )}
        </>
      }>
      {!answer && !problem && (
        <p className='m-0 text-[12.5px] text-ink-3'>Reading the templates…</p>
      )}
      {answer && templates.length === 0 && (
        <p className='m-0 rounded-[9px] border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-ink-3'>
          No template yet — bring one in below.
        </p>
      )}
      <div
        role={onChoose ? 'radiogroup' : undefined}
        aria-label='Templates'
        className='flex flex-col gap-1.5'>
        {templates.map((template) => (
          <TemplateRow
            key={template.name}
            template={template}
            editorVersion={answer?.editorVersion ?? null}
            picked={onChoose ? template.name === picked : undefined}
            onPick={onChoose ? () => setPickedHere(template.name) : undefined}
          />
        ))}
      </div>
      {problem && (
        <p
          role='alert'
          className='m-0 rounded-md bg-local-soft px-3 py-2 text-[12.5px] text-local'>
          {problem}
        </p>
      )}

      <section className='flex flex-col gap-2 rounded-lg border border-line bg-ground px-3 py-2.5'>
        <h4 className='m-0 text-[10.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase'>
          Bring a template in
        </h4>
        <p className='m-0 text-[12px] text-ink-2'>
          A kdenlive archive — Project › Archive project, as .zip or .tar.gz — holds the project
          with the music, logos and titles it uses. Every file it names is looked for once it is in.
        </p>
        <Form
          value={form}
          className='flex flex-wrap items-end gap-2'>
          <FormField
            field={form.fields.name}
            label='Name'
            description='Leave it empty to name it after the archive'
            className='min-w-[220px] flex-1'>
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
            {bringing ? `Bringing in ${bringing}…` : 'Choose an archive…'}
          </Go>
        </Form>
        <input
          ref={fileInput}
          type='file'
          aria-label='Template archive'
          accept='.zip,.tar.gz,.tgz,.tar,.kdenlive'
          className='hidden'
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void bringIn(file)
          }}
        />
      </section>
    </Modal>
  )
}

export { TemplatesDialog }
