import { plural, t } from '@lingui/core/macro'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { importFiles, pathOf, whatIsComing } from '../helpers/import'
import { routingEngine } from '../helpers/routing'
import { refusalSchema } from '../hooks/useBoardState'
import { Go } from './buttons'
import { Icon } from './icons'
import { ERROR, INPUT, Modal, Spacer } from './modal'
import { getThumbUrl } from './utils'

const originSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('loose') }),
  z.object({ kind: z.literal('dropzone'), name: z.string() }),
  z.object({ kind: z.literal('jump'), name: z.string() }),
  z.object({ kind: z.literal('montage'), name: z.string() })
])

const candidatesSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(false), reason: z.string() }),
  z.object({
    ok: z.literal(true),
    members: z.array(z.string()).default([]),
    clips: z.array(
      z.object({
        id: z.string(),
        filename: z.string(),
        path: z.string(),
        mtime: z.number(),
        origin: originSchema,
        freed: z.boolean(),
        still: z.boolean()
      })
    )
  })
])

type Origin = z.infer<typeof originSchema>

const originLabel = (origin: Origin) =>
  origin.kind === 'loose'
    ? t`Loose`
    : origin.kind === 'montage'
      ? t`In ${origin.name}’s montage`
      : t`In ${origin.name}`

const timeOf = (mtime: number) =>
  new Date(mtime * 1000).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })

const FilmClipPicker = ({
  groupId,
  onAdded,
  onClose
}: {
  groupId: string
  onAdded: () => void
  onClose: () => void
}) => {
  const [clips, setClips] = useState<z.infer<typeof candidatesSchema> | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    routingEngine
      .loader({ url: '/api/edit-clips', searchParamsArgs: { groupId } })
      .then((raw) => {
        const parsed = candidatesSchema.safeParse(raw)
        if (!cancelled)
          if (parsed.success) setClips(parsed.data)
          else setProblem(t`The clips on the board could not be read.`)
      })
      .catch(() => {
        if (!cancelled) setProblem(t`The clips on the board could not be read.`)
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  const found = clips?.ok ? clips.clips : []
  const typed = search.trim().toLowerCase()
  const shown = found.filter(
    (clip) =>
      typed === '' || `${clip.filename} ${originLabel(clip.origin)}`.toLowerCase().includes(typed)
  )

  const add = async () => {
    setWorking(true)
    setProblem(null)
    const answer = await routingEngine
      .action({
        url: '/api/edit-clips',
        searchParamsArgs: { groupId },
        actionArgs: { intent: 'add', groupId, fileIds: chosen }
      })
      .catch(() => null)
    const refused = refusalSchema.safeParse(answer)
    if (refused.success || answer === null) {
      setProblem(refused.data?.globalErrors?.[0] ?? t`The clips could not be added.`)
      setWorking(false)
      return
    }
    onAdded()
    onClose()
  }

  const fromComputer = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setWorking(true)
    setProblem(null)
    const coming = await whatIsComing(
      [...files].map((file) => {
        const at = pathOf(file)
        return at ? { at, name: file.name, size: file.size, file } : file
      })
    )
    if (coming.length === 0) {
      setProblem(t`Nothing there is a video or a photo SkyDock can show.`)
      setWorking(false)
      return
    }
    const tally = await importFiles(coming, `montage:${groupId}`, t`the film`)
    onAdded()
    if (tally.failed.length > 0) {
      setProblem(tally.failed.join(' · '))
      setWorking(false)
      return
    }
    onClose()
  }

  return (
    <Modal
      label={t`Add a clip`}
      title={t`Add a clip`}
      sub={t`The nearest in time to this jump come first.`}
      full={720}
      onClose={onClose}
      footer={
        <>
          <label className='inline-flex h-9.5 cursor-pointer items-center gap-2 rounded-corner bg-pane px-4 text-lead font-bold text-accent-ink shadow-card hover:bg-accent-soft'>
            <Icon
              name='plus'
              size={13}
            />
            {t`From the computer…`}
            <input
              type='file'
              multiple
              accept='video/*,image/*'
              className='sr-only'
              disabled={working}
              onChange={(e) => void fromComputer(e.target.files)}
            />
          </label>
          <Spacer />
          <Go
            disabled={chosen.length === 0 || working}
            onClick={() => void add()}>
            {chosen.length === 0
              ? t`Add`
              : plural(chosen.length, { one: 'Add # clip', other: 'Add # clips' })}
          </Go>
        </>
      }>
      <div className='flex min-h-0 flex-1 flex-col gap-2.5 px-6.5 py-4'>
        <input
          type='search'
          aria-label={t`Search the clips`}
          placeholder={t`Search by name or place`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={INPUT}
        />
        {problem && <p className={`m-0 ${ERROR}`}>{problem}</p>}
        {clips && !clips.ok && <p className={`m-0 ${ERROR}`}>{clips.reason}</p>}
        <div className='flex min-h-0 flex-1 flex-col gap-1 overflow-auto'>
          {clips?.ok && shown.length === 0 && (
            <p className='m-0 text-body text-ink-3'>
              {found.length === 0
                ? t`Every clip on the board is already in this film.`
                : t`No clip matches that.`}
            </p>
          )}
          {shown.map((clip) => {
            const on = chosen.includes(clip.id)
            return (
              <label
                key={clip.id}
                className={`grid grid-cols-[auto_56px_minmax(0,1fr)] items-center gap-2.5 rounded-corner border border-transparent p-1.5 ${
                  clip.freed ? 'opacity-55' : 'cursor-pointer hover:bg-well'
                }`}>
                <input
                  type='checkbox'
                  checked={on}
                  disabled={clip.freed}
                  onChange={() =>
                    setChosen(on ? chosen.filter((id) => id !== clip.id) : [...chosen, clip.id])
                  }
                />
                <span className='grid h-8.5 w-14 place-items-center overflow-hidden rounded-corner bg-well'>
                  {!clip.freed && (
                    <img
                      src={getThumbUrl(clip.path, 0, 160)}
                      alt=''
                      loading='lazy'
                      draggable={false}
                      className='size-full object-cover'
                    />
                  )}
                </span>
                <span className='grid min-w-0'>
                  <span
                    title={clip.filename}
                    className='truncate font-medium'>
                    {clip.filename}
                  </span>
                  <span className='flex gap-1.5 truncate text-small text-ink-3'>
                    <span>{timeOf(clip.mtime)}</span>
                    <span>
                      {clip.freed
                        ? t`On the storage only, bring it back first`
                        : originLabel(clip.origin)}
                    </span>
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

export { candidatesSchema, FilmClipPicker }
