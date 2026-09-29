import { plural, t } from '@lingui/core/macro'
import type { FileStatus, ProxyFact, StatusContext, MontageProgress } from '@skydock/scripts'
import { dayLabel } from '../helpers/jumps'
import { cardsOf } from '../helpers/sections'
import type { Section } from '../helpers/sections'
import { FileList, kindOf } from './file-list'
import type { FileShape, Kind, Modifiers } from './file-list'
import { StepMeter } from './montage-steps'
import type { ManifestFile, ManifestGroup } from './types'
import {
  dateLabel,
  formatSize,
  getPictureUrl,
  hhmm,
  minFileMtime,
  shortDate,
  weekday
} from './utils'

/* A folder's files. By day, under headers that stay pinned while their files scroll by; as one list,
   all together. By jump, the jumps are cards side by side and one is open, its files listed under
   them — so every jump stays in sight, and a file is moved by dropping it on another's card. */

type JumpControls = {
  selected: string | null
  frozen: Set<string>
  overTarget: string | null
  dropTarget: (groupId: string) => Record<string, unknown>
  /* a plain click selects the jump; ⌘/ctrl-click on a second one compares the two */
  onSelect: (groupId: string, e?: Modifiers) => void
  onDrag: (groupId: string, e?: React.DragEvent) => void
  /* a montage's one next step, and what shows above its files */
  actions?: (group: ManifestGroup) => React.ReactNode
  above?: (group: ManifestGroup) => React.ReactNode
  /* where a montage has got to; nothing for a jump that is not one */
  progress?: (group: ManifestGroup) => MontageProgress | null
}

type Props = {
  sections: Section[]
  kind: Kind
  shape: FileShape
  picked: string[]
  sortKey: (file: ManifestFile) => string | number
  statusContext: (file: ManifestFile) => StatusContext
  statusOf: (file: ManifestFile) => FileStatus
  proxies: Record<string, ProxyFact>
  deliveredName: (file: ManifestFile) => string | null
  onFile: (file: ManifestFile, lane: ManifestFile[], e: Modifiers) => void
  onPick: (file: ManifestFile) => void
  onOpen: (file: ManifestFile) => void
  previewed: string | null
  offGap: Set<string>
  onDragFile: (file: ManifestFile, e?: React.DragEvent) => void
  jump: JumpControls
  /* by jump, the jumps are cards and one of them is open, its files listed under the cards */
  cards?: {
    open: string | null
    onOpen: (key: string) => void
    /* the open one is the only one, and is described elsewhere: its files, without its card */
    hidden?: boolean
  }
  empty: string
}

/* A fact about a run of files, said quietly: a small word in the colour of what it says */
const Tag = ({ tone, children }: { tone: 'local' | 'proc' | 'up' | 'lock'; children: string }) => (
  <span
    className={`text-[11px] font-medium whitespace-nowrap ${
      { local: 'text-local', proc: 'text-proc', up: 'text-up', lock: 'text-lock' }[tone]
    }`}>
    {children}
  </span>
)

/* how far a run of files has got, in one word or a count of what is left */
const progressTag = (files: ManifestFile[], statusOf: (file: ManifestFile) => FileStatus) => {
  const local = files.filter((f) => statusOf(f) === 'local').length
  const processed = files.filter((f) => statusOf(f) === 'processed').length
  if (files.length === 0) return null
  if (local > 0) return <Tag tone='local'>{t`${local} to process`}</Tag>
  if (processed > 0) return <Tag tone='proc'>{t`${processed} to upload`}</Tag>
  return <Tag tone='up'>{t`uploaded`}</Tag>
}

const videosIn = (files: ManifestFile[]) => files.filter((f) => kindOf(f) === 'video').length

const counts = (files: ManifestFile[]) => {
  const videos = videosIn(files)
  const photos = files.length - videos
  return t`${plural(videos, { one: '# video', other: '# videos' })} · ${plural(photos, { one: '# photo', other: '# photos' })}`
}

/* A day heads its files as a line of type, pinned while they scroll by: the day in full, then
   quietly what it holds and how far it has got. */
const DayHeader = ({
  day,
  files,
  loose,
  statusOf
}: {
  day: string
  files: ManifestFile[]
  loose?: boolean
  statusOf: (file: ManifestFile) => FileStatus
}) => (
  <div className='sticky top-0 z-[3] flex flex-wrap items-baseline gap-x-2.5 gap-y-1 bg-pane pt-4 pb-2.5'>
    <span className='text-[15px] font-semibold text-ink'>
      {loose ? t`Loose files` : dayLabel(day, true)}
    </span>
    <span className='text-[12px] text-ink-3'>
      {loose ? `${day ? `${dayLabel(day)} · ` : ''}${t`in no jump`} · ` : ''}
      {counts(files)}
    </span>
    <span className='self-center'>{progressTag(files, statusOf)}</span>
  </div>
)

/* A jump as a card: enough to tell it from the others at a glance — its first frame, when it
   started, which it is, what it holds and how far it has got. Choosing it lists its files under the
   cards; dropping files on it moves them into it; dragging it onto a folder files the whole jump. A
   day's loose files get a card too, which lists them but takes nothing, since they are in no jump. */
const JumpCard = ({
  section,
  open,
  statusOf,
  jump,
  proxies,
  strays,
  onOpen
}: {
  section: Exclude<Section, { kind: 'day' } | { kind: 'all' }>
  open: boolean
  statusOf: (file: ManifestFile) => FileStatus
  jump: JumpControls
  /* where each clip's small copy is, so the card's picture is cut from it rather than from 4K */
  proxies: Record<string, ProxyFact>
  /* how many of its files the gap rule would not have put in it */
  strays: number
  onOpen: () => void
}) => {
  const group = section.kind === 'jump' ? section.group : null
  const frozen = group ? jump.frozen.has(group.id) : false
  const over = group !== null && jump.overTarget === `group:${group.id}`
  const from = minFileMtime(section.files) ?? 0
  const first = group?.freed ? undefined : [...section.files].sort((a, b) => a.mtime - b.mtime)[0]
  const label = section.kind === 'jump' ? section.label : t`Loose files`
  const progress = group ? (jump.progress?.(group) ?? null) : null
  const videos = videosIn(section.files)
  const size = section.files.reduce((sum, f) => sum + f.size, 0)
  return (
    <div
      {...(group ? jump.dropTarget(group.id) : {})}
      role='button'
      tabIndex={0}
      aria-pressed={open}
      aria-label={`${label}${group ? `, ${dateLabel(from)} ${hhmm(from)}` : ''}, ${counts(section.files)}`}
      draggable={group !== null && !frozen}
      onDragStart={(e) => {
        if (!group || e.target !== e.currentTarget) return
        e.stopPropagation()
        jump.onDrag(group.id, e)
      }}
      onClick={(e) => {
        /* a second jump asked for beside the selected one: compared, and nothing else changes */
        if (group && (e.ctrlKey || e.metaKey) && jump.selected && jump.selected !== group.id) {
          jump.onSelect(group.id, e)
          return
        }
        onOpen()
        if (group && jump.selected !== group.id) jump.onSelect(group.id)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onOpen()
      }}
      title={
        group && !frozen
          ? t`Click to list its files · ⌘/ctrl-click a second jump to compare the two · drop files here to move them into it, holding alt to copy them instead · drag onto a folder to file the whole jump`
          : t`Click to list its files`
      }
      /* the loose card is not a jump and must not pass for one: narrower, dashed, and on nothing of
         its own */
      className={`flex flex-none flex-col overflow-hidden rounded-lg border text-left ${
        group ? 'w-[184px]' : 'w-[112px] border-dashed'
      } ${group && !frozen ? 'cursor-grab' : 'cursor-pointer'} ${
        over
          ? 'border-dashed border-pick bg-pick-soft'
          : open
            ? 'border-accent bg-pane shadow-[0_0_0_1px_var(--color-accent)]'
            : group
              ? 'border-line bg-pane hover:border-line-strong'
              : 'border-line-strong bg-transparent hover:border-ink-3'
      }`}>
      {group ? (
        <span className='pointer-events-none relative block h-[100px] flex-none overflow-hidden bg-well'>
          {first && (
            <img
              src={getPictureUrl(first, proxies[first.path], 320)}
              alt=''
              loading='lazy'
              decoding='async'
              draggable={false}
              className='block h-full w-full object-cover'
            />
          )}
          <span className='absolute bottom-1.5 left-1.5 rounded bg-black/[0.62] px-1.5 py-px text-[10.5px] font-medium text-white tabular-nums'>
            ▶ {videos} · ◻ {section.files.length - videos}
          </span>
        </span>
      ) : (
        /* loose files share no one moment and no one picture: only how many there are */
        <span className='grid h-[100px] flex-none place-items-center text-[12px] text-ink-3'>
          {plural(section.files.length, { one: '# file', other: '# files' })}
        </span>
      )}
      <span className='flex items-baseline justify-between gap-2 px-2.5 pt-2'>
        {group ? (
          <>
            <b className='flex-none text-[13px] font-semibold text-ink tabular-nums'>
              {hhmm(from)}
            </b>
            <span className='min-w-0 truncate text-[11.5px] text-ink-3'>{label}</span>
          </>
        ) : (
          <b className='text-[13px] font-medium text-ink-3'>{t`Loose`}</b>
        )}
      </span>
      <span className='truncate px-2.5 pt-px pb-2 text-[11.5px] text-ink-3'>
        {group
          ? `${weekday(new Date(from * 1000), 'short')} ${shortDate(from)} · ${formatSize(size)}`
          : t`in no jump`}
      </span>
      {/* what it has got to, small and last, so every card keeps the same face above it */}
      {group && (
        <span className='-mt-1.5 flex flex-col gap-1.5 px-2.5 pb-2'>
          <span className='flex flex-wrap items-center gap-x-2 gap-y-0.5'>
            {group.freed ? (
              <Tag tone='lock'>{t`storage only`}</Tag>
            ) : progress ? (
              /* a montage says the step it is at, which says more than its files' state */
              <Tag tone={progress.next ? 'local' : 'up'}>{progress.next?.todo ?? t`done`}</Tag>
            ) : frozen ? (
              <Tag tone='lock'>{t`🔒 edit`}</Tag>
            ) : (
              progressTag(section.files, statusOf)
            )}
            {/* a file off the gap rule is flagged where it is, and its jump says so from the
                outside */}
            {strays > 0 && (
              <span
                title={plural(strays, {
                  one: '# file more than 15 minutes from the rest of this jump — the gap rule would not have put it here',
                  other:
                    '# files more than 15 minutes from the rest of this jump — the gap rule would not have put them here'
                })}
                className='text-[11px] font-medium whitespace-nowrap text-changed'>
                ⧗ {t`${strays} off the gap`}
              </span>
            )}
          </span>
          {progress && <StepMeter progress={progress} />}
        </span>
      )}
    </div>
  )
}

const FileBrowser = ({ sections, statusOf, jump, cards, empty, ...list }: Props) => {
  if (sections.length === 0)
    return (
      <div className='mt-3 rounded-lg border border-dashed border-line-strong px-4 py-7 text-center text-ink-3'>
        {empty}
      </div>
    )
  const files = (key: string, shown: ManifestFile[], title?: string) => (
    <FileList
      key={`files:${key}`}
      {...list}
      files={shown}
      title={title}
      selecting={list.picked.length > 0}
    />
  )

  /* By jump: every jump a card in a strip, and under them the open one's files. Nothing repeats
     the card in a bar above them — what the jump is, and what can be done to it, is in the panel on
     the right. Only a montage's next step stays here, beside the files it acts on. */
  const cardSections = cardsOf(sections)
  if (cards && cardSections.length > 0) {
    const open = cardSections.find((s) => s.key === cards.open) ?? cardSections[0]!
    const openLabel = open.kind === 'jump' ? open.label : t`Loose files`
    return (
      <div className='@container'>
        {!cards.hidden && (
          <div className='mt-3 flex flex-wrap items-start gap-2.5'>
            {cardSections.map((s) => (
              <JumpCard
                key={s.key}
                section={s}
                open={s.key === open.key}
                statusOf={statusOf}
                jump={jump}
                proxies={list.proxies}
                strays={s.files.filter((f) => f.id && list.offGap.has(f.id)).length}
                onOpen={() => cards.onOpen(s.key)}
              />
            ))}
          </div>
        )}
        <section
          aria-label={openLabel}
          className='mt-3.5 flex flex-col gap-2.5'>
          {open.kind === 'jump' && jump.actions?.(open.group) && (
            <div className='flex flex-wrap items-center gap-2'>{jump.actions(open.group)}</div>
          )}
          {open.kind === 'jump' && jump.above?.(open.group)}
          {!(open.kind === 'jump' && open.group.freed) && files(open.key, open.files, openLabel)}
        </section>
      </div>
    )
  }

  return (
    <div className='@container'>
      {sections.map((section) => (
        <section
          key={section.key}
          aria-label={section.kind === 'jump' ? section.label : undefined}>
          {section.kind === 'day' && (
            <DayHeader
              day={section.day}
              files={section.files}
              statusOf={statusOf}
            />
          )}
          {section.kind === 'loose' && (
            <DayHeader
              day={section.day}
              files={section.files}
              loose
              statusOf={statusOf}
            />
          )}
          {section.kind === 'all' && <div className='h-3' />}
          {section.kind === 'jump' && jump.above?.(section.group)}
          {!(section.kind === 'jump' && section.group.freed) &&
            files(section.key, section.files, section.kind === 'jump' ? section.label : undefined)}
        </section>
      ))}
    </div>
  )
}

export { FileBrowser }
export type { JumpControls }
