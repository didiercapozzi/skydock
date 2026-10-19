import { t } from '@lingui/core/macro'
import { filmTemplatesAnswerSchema } from '@skydock/scripts/client'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { filmTemplateHref } from '../helpers/places'
import { useLoaded } from '../hooks/useLoaded'
import { Go, Mini } from './buttons'
import { askFilmTemplates, MissingMusic, NameForm, summaryOf } from './film-template-modals'
import { ERROR, Modal, Spacer } from './modal'

const DeleteAsk = ({
  name,
  onDelete,
  onKeep
}: {
  name: string
  onDelete: () => void
  onKeep: () => void
}) => {
  const keep = useRef<HTMLSpanElement>(null)
  useEffect(() => keep.current?.querySelector('button')?.focus(), [])
  return (
    <div className='flex flex-col gap-2'>
      <p className='m-0 text-body font-semibold text-ink'>{t`Delete this film template?`}</p>
      <p className='m-0 text-body text-ink-2'>
        {t`${name} goes. Films already made with it stay as they are.`}
      </p>
      <span className='flex gap-1.5'>
        <Go onClick={onDelete}>{t`Delete it`}</Go>
        <span ref={keep}>
          <Mini onClick={onKeep}>{t`Keep it`}</Mini>
        </span>
      </span>
    </div>
  )
}

type Doing = { kind: 'rename' | 'delete'; name: string }

const FilmTemplatesDialog = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate()
  const [again, setAgain] = useState(0)
  const [doing, setDoing] = useState<Doing | null>(null)
  const [adding, setAdding] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const { data, problem } = useLoaded('/api/film-templates', filmTemplatesAnswerSchema, {
    failed: t`The film templates could not be read.`,
    deps: [again]
  })

  const ask = async (call: Parameters<typeof askFilmTemplates>[0]) => {
    const answer = await askFilmTemplates(call)
    setRefused(answer.said)
    if (answer.said === null) {
      setDoing(null)
      setAdding(false)
      setAgain((n) => n + 1)
    }
    return answer
  }

  const templates = data?.templates ?? []

  return (
    <Modal
      label={t`Film templates`}
      title={t`Film templates`}
      wide
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
        </>
      }>
      {!data && !problem && (
        <p className='m-0 text-body text-ink-3'>{t`Reading the film templates…`}</p>
      )}
      {problem && <p className={`m-0 ${ERROR}`}>{problem}</p>}
      {data && templates.length === 0 && (
        <p className='m-0 rounded-corner border border-dashed border-line-2 px-3 py-4 text-center text-body text-ink-3'>
          {t`No film template yet. Make one here, or keep a film you have edited from its editor.`}
        </p>
      )}
      <div className='flex flex-col gap-1.5'>
        {templates.map(({ name, template, missing }) => (
          <div
            key={name}
            className='flex flex-col gap-1.5 rounded-corner border border-line-2 bg-pane px-3 py-2'>
            <span className='flex flex-wrap items-center gap-2'>
              <b className='text-body font-semibold text-ink'>{name}</b>
              <span className='text-small text-ink-3'>{summaryOf(template)}</span>
              <Spacer />
              {!doing && (
                <>
                  <Mini
                    label={t`Edit ${name}`}
                    onClick={() => navigate(filmTemplateHref(name))}>
                    {t`Edit`}
                  </Mini>
                  <Mini
                    label={t`Rename ${name}`}
                    onClick={() => setDoing({ kind: 'rename', name })}>
                    {t`Rename`}
                  </Mini>
                  <Mini
                    label={t`Duplicate ${name}`}
                    onClick={() => void ask({ intent: 'duplicate', name })}>
                    {t`Duplicate`}
                  </Mini>
                  <Mini
                    label={t`Delete ${name}`}
                    onClick={() => setDoing({ kind: 'delete', name })}>
                    {t`Delete`}
                  </Mini>
                </>
              )}
            </span>
            <MissingMusic names={missing} />
            {doing?.name === name && doing.kind === 'rename' && (
              <NameForm
                initial={name}
                submitLabel={() => t`Rename`}
                onSubmit={async (to) => {
                  await ask({ intent: 'rename', name, to })
                }}
                onCancel={() => setDoing(null)}
              />
            )}
            {doing?.name === name && doing.kind === 'delete' && (
              <DeleteAsk
                name={name}
                onDelete={() => void ask({ intent: 'delete', name })}
                onKeep={() => setDoing(null)}
              />
            )}
          </div>
        ))}
      </div>
      {(data?.broken ?? []).map((name) => (
        <div
          key={name}
          className='flex flex-col gap-1.5 rounded-corner border border-line-2 bg-pane px-3 py-2'>
          <span className='flex flex-wrap items-center gap-2'>
            <b className='text-body font-semibold text-ink'>{name}</b>
            <span className='text-small text-ink-3'>{t`This file cannot be read as a film template.`}</span>
            <Spacer />
            {!doing && (
              <Mini
                label={t`Delete ${name}`}
                onClick={() => setDoing({ kind: 'delete', name })}>
                {t`Delete`}
              </Mini>
            )}
          </span>
          {doing?.name === name && (
            <DeleteAsk
              name={name}
              onDelete={() => void ask({ intent: 'delete', name })}
              onKeep={() => setDoing(null)}
            />
          )}
        </div>
      ))}
      {refused && (
        <p
          role='alert'
          className={`m-0 ${ERROR}`}>
          {refused}
        </p>
      )}
      {adding ? (
        <NameForm
          submitLabel={() => t`Create and open`}
          onSubmit={async (name) => {
            const made = await ask({ intent: 'create', name })
            if (made.said === null) navigate(filmTemplateHref(made.name))
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <span className='flex'>
          <Go onClick={() => setAdding(true)}>{t`New film template`}</Go>
        </span>
      )}
    </Modal>
  )
}

export { FilmTemplatesDialog }
