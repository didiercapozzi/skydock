import { plural, t } from '@lingui/core/macro'
import type { FileStatus, ProxyFact, StatusContext, MontageProgress } from '@skydock/scripts'
import { dayLabel } from '../helpers/jumps'
import { cardsOf } from '../helpers/sections'
import type { Section } from '../helpers/sections'
import { FileList, kindOf } from './file-list'
import type { FileShape, Kind, Modifiers } from './file-list'
import { StepMeter } from './montage-steps'
import type { ManifestFile, ManifestGroup } from './types'
import { dateLabel, formatSize, getPictureUrl, hhmm, minFileMtime } from './utils'

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

/* A fact about a run of files, said as a small tinted pill with a dot of its colour */
const TAGS = {
  local: 'bg-local-soft text-local',
  proc: 'bg-proc-soft text-proc',
  up: 'bg-up-soft text-up',
  lock: 'bg-lock-soft text-lock'
}

const Tag = ({ tone, children }: { tone: keyof typeof TAGS; children: string }) => (
  <span
    className={`inline-flex h-[22px] items-center gap-1.5 rounded-full px-[9px] text-[11.5px] font-bold whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current before:content-[''] ${TAGS[tone]}`}>
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

/* when a run of files began and ended, to the minute */
const timeSpan = (files: ManifestFile[]) => {
  const from = minFileMtime(files) ?? 0
  const to = files.reduce((latest, f) => Math.max(latest, f.mtime), from)
  return `${hhmm(from)}${hhmm(to) === hhmm(from) ? '' : `–${hhmm(to)}`}`
}

const videosIn = (files: ManifestFile[]) => files.filter((f) => kindOf(f) === 'video').length

const counts = (files: ManifestFile[]) => {
  const videos = videosIn(files)
  const photos = files.length - videos
  return t`${plural(videos, { one: '# video', other: '# videos' })} · ${plural(photos, { one: '# photo', other: '# photos' })}`
}

/* A day heads its files as a line of type: the day in full, then quietly what it holds — files, videos
   and photos on one line — and how far it has got. */
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
  <div className='flex flex-wrap items-center gap-x-3 gap-y-1 pt-3.5 pb-2.5'>
    {/* small and grey like the column headings under it, but in the words' own case, so the day reads as part of the table, not above it */}
    <span className='text-[12px] font-bold text-ink-3'>
      {loose ? t`Loose files` : dayLabel(day, true)}
    </span>
    <span className='text-[12px] font-medium text-ink-3'>
      {loose ? `${day ? `${dayLabel(day)} · ` : ''}${t`in no jump`} · ` : ''}
      {plural(files.length, { one: '# file', other: '# files' })} · {counts(files)}
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
      /* a jump is a photograph: its first frame full-bleed under a dark foot, its name and time
         written on it. The loose card is not a jump and must not pass for one: dashed, flat and on
         no picture — but the same size, so the cards keep their rows and columns */
      className={`relative block h-[150px] w-full overflow-hidden rounded-[16px] text-left ${
        group
          ? `bg-well text-white ${frozen ? 'cursor-pointer' : 'cursor-grab'}`
          : 'cursor-pointer border-2 border-dashed border-line-strong bg-transparent text-ink-3 hover:border-ink-3'
      } ${
        over
          ? 'shadow-[0_0_0_3px_var(--color-pane),0_0_0_5px_var(--color-pick)]'
          : open
            ? 'shadow-[0_0_0_3px_var(--color-pane),0_0_0_5px_var(--color-accent)]'
            : group
              ? 'shadow-card'
              : ''
      }`}>
      {group ? (
        <>
          {first && (
            <img
              src={getPictureUrl(first, proxies[first.path], 640)}
              alt=''
              loading='lazy'
              decoding='async'
              draggable={false}
              className='pointer-events-none absolute inset-0 block h-full w-full object-cover'
            />
          )}
          <span className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,22,0)_35%,rgba(8,12,22,0.78)_100%)]' />
          <span
            className={`pointer-events-none absolute top-[11px] left-3 z-[1] flex h-[22px] items-center rounded-full px-[9px] text-[11.5px] font-bold backdrop-blur-[6px] ${
              open ? 'bg-accent text-white' : 'bg-[rgba(8,12,22,0.55)]'
            }`}>
            {plural(section.files.length, { one: '# file', other: '# files' })} · {formatSize(size)}
          </span>
        </>
      ) : (
        /* loose files share no one moment and no one picture: only how many there are */
        <span className='pointer-events-none absolute top-[11px] left-3 text-[12px] font-semibold'>
          {plural(section.files.length, { one: '# file', other: '# files' })}
        </span>
      )}
      {/* what it has got to, small and at the top, so every card keeps the same face */}
      {group && (
        <span className='pointer-events-none absolute top-[11px] right-3 z-[1] flex flex-col items-end gap-1'>
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
              className='pointer-events-auto inline-flex h-[22px] items-center rounded-full bg-changed-soft px-[9px] text-[11.5px] font-bold whitespace-nowrap text-changed'>
              ⧗ {t`${strays} off the gap`}
            </span>
          )}
        </span>
      )}
      <span className='pointer-events-none absolute right-3.5 bottom-3 left-3.5 z-[1] flex flex-col gap-1.5'>
        {group && progress && <StepMeter progress={progress} />}
        <span className='flex items-end gap-2'>
          {/* a jump is a gathering of files, so it is named as one — never by one file's time */}
          <b
            className={`min-w-0 truncate font-display text-[19px] font-bold tracking-[-0.02em] ${group ? '' : 'text-ink-3'}`}>
            {group ? label : t`Loose`}
          </b>
          <span
            className={`ml-auto flex-none text-[12px] font-semibold tabular-nums ${group ? 'opacity-[0.92]' : ''}`}>
            {group ? timeSpan(section.files) : t`in no jump`}
          </span>
        </span>
      </span>
    </div>
  )
}

const FileBrowser = ({ sections, statusOf, jump, cards, empty, ...list }: Props) => {
  if (sections.length === 0)
    return (
      <div className='mt-3 rounded-[16px] border-2 border-dashed border-line-strong px-4 py-7 text-center font-medium text-ink-3'>
        {empty}
      </div>
    )
  const files = (
    key: string,
    shown: ManifestFile[],
    title?: string,
    about?: string,
    bare?: boolean
  ) => (
    /* one block, so the space between a jump's parts is not also put inside its list */
    <div key={`files:${key}`}>
      <FileList
        {...list}
        files={shown}
        title={title}
        about={about}
        bare={bare}
      />
    </div>
  )

  /* By jump: every jump a card in a strip, and under them the open one's files. Nothing repeats
     the card in a bar above them — what the jump is, and what can be done to it, is in the panel on
     the right. Only a montage's next step stays here, beside the files it acts on. */
  const cardSections = cardsOf(sections)
  if (cards && cardSections.length > 0) {
    const open = cardSections.find((s) => s.key === cards.open) ?? cardSections[0]!
    const openLabel = open.kind === 'jump' ? open.label : t`Loose files`
    /* one grid of equal cells, so with many jumps the cards line up in columns and rows, the loose
       files' card among them; a row's cards are as tall as its tallest */
    return (
      <div className='@container'>
        {!cards.hidden && (
          <div className='grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5'>
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
          className='mt-[18px] flex flex-col gap-[18px]'>
          {open.kind === 'jump' && jump.actions?.(open.group) && (
            <div className='flex flex-wrap items-center gap-2'>{jump.actions(open.group)}</div>
          )}
          {open.kind === 'jump' && jump.above?.(open.group)}
          {!(open.kind === 'jump' && open.group.freed) &&
            files(
              open.key,
              open.files,
              openLabel,
              open.kind === 'jump' ? timeSpan(open.files) : undefined
            )}
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
            files(
              section.key,
              section.files,
              section.kind === 'jump' ? section.label : undefined,
              undefined,
              /* a day says how many it holds in its own heading */
              section.kind === 'day' || section.kind === 'loose'
            )}
        </section>
      ))}
    </div>
  )
}

export { FileBrowser }
export type { JumpControls }
