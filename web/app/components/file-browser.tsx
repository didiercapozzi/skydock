import { plural, t } from '@lingui/core/macro'
import type { FileStatus, ProxyFact, StatusContext, MontageProgress } from '@skydock/scripts'
import { dayLabel } from '../helpers/jumps'
import { cardsOf } from '../helpers/sections'
import type { Section } from '../helpers/sections'
import { FileList, kindOf } from './file-list'
import type { FileShape, Kind, Modifiers } from './file-list'
import type { LiveFile } from '../hooks/useLiveProgress'
import { StepMeter } from './montage-steps'
import type { ManifestFile, ManifestGroup } from './types'
import { dateLabel, getPictureUrl, hhmm, minFileMtime } from './utils'

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
  /* files being processed or proxied right now, and how far through */
  live?: Record<string, LiveFile>
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

const Tag = ({ tone, children }: { tone: 'local' | 'proc' | 'up' | 'lock'; children: string }) => (
  <span
    className={`rounded-full px-[7px] py-px text-[11px] font-semibold whitespace-nowrap ${
      {
        local: 'bg-local-soft text-local',
        proc: 'bg-proc-soft text-proc',
        up: 'bg-up-soft text-up',
        lock: 'bg-lock-soft text-lock'
      }[tone]
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

const counts = (files: ManifestFile[]) => {
  const videos = files.filter((f) => kindOf(f) === 'video').length
  const photos = files.length - videos
  return t`${plural(videos, { one: '# video', other: '# videos' })} · ${plural(photos, { one: '# photo', other: '# photos' })}`
}

const HEAD =
  'sticky top-0 z-[3] mt-3 mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border px-3 py-2 shadow-card'

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
  <div className={`${HEAD} border-line bg-pane`}>
    <span className='text-[13px] font-semibold text-ink'>
      {loose ? t`Loose files` : dayLabel(day)}
    </span>
    <span className='text-[12px] text-ink-3'>
      {loose ? `${day ? `${dayLabel(day)} · ` : ''}${t`in no jump`} · ` : ''}
      {counts(files)}
    </span>
    {progressTag(files, statusOf)}
  </div>
)

/* A jump as a card: enough to tell it from the others at a glance — which it is, when, what it
   holds, how far it has got, and a few frames off it. Choosing it lists its files under the cards;
   dropping files on it moves them into it; dragging it onto a folder files the whole jump. A day's
   loose files get a card too, which lists them but takes nothing, since they are in no jump. */
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
  /* where each clip's small copy is, so the card's frames are cut from it rather than from 4K */
  proxies: Record<string, ProxyFact>
  /* how many of its files the gap rule would not have put in it */
  strays: number
  onOpen: () => void
}) => {
  const group = section.kind === 'jump' ? section.group : null
  const frozen = group ? jump.frozen.has(group.id) : false
  const over = group !== null && jump.overTarget === `group:${group.id}`
  const from = minFileMtime(section.files) ?? 0
  const frames = group?.freed
    ? []
    : [...section.files].sort((a, b) => a.mtime - b.mtime).slice(0, 4)
  const label = section.kind === 'jump' ? section.label : t`Loose files`
  const progress = group ? (jump.progress?.(group) ?? null) : null
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
      /* the loose card is not a jump and must not pass for one: dashed, flat, on the page's own
         ground rather than raised on white */
      className={`flex min-w-0 flex-col gap-1.5 rounded-[10px] border-2 p-2.5 text-left ${
        group ? 'shadow-card' : 'border-dashed'
      } ${group && !frozen ? 'cursor-grab' : 'cursor-pointer'} ${
        over
          ? 'border-dashed border-pick bg-pick-soft'
          : open
            ? 'border-accent bg-accent-soft'
            : group
              ? 'border-line bg-pane hover:border-ink-3'
              : 'border-ink-3/40 bg-ground hover:border-ink-3'
      }`}>
      <span className='flex items-baseline gap-1.5'>
        <b className='min-w-0 flex-1 truncate text-[13.5px] text-ink'>{label}</b>
        {group?.freed ? (
          <Tag tone='lock'>{t`storage only`}</Tag>
        ) : progress ? (
          /* a montage says the step it is at, which says more than its files' state */
          <Tag tone={progress.next ? 'local' : 'up'}>{progress.next?.todo ?? t`done`}</Tag>
        ) : frozen ? (
          <Tag tone='lock'>{t`🔒 edit`}</Tag>
        ) : (
          progressTag(section.files, statusOf)
        )}
      </span>
      {progress && <StepMeter progress={progress} />}
      {/* a file off the gap rule is flagged where it is, and its jump says so from the outside */}
      {strays > 0 && (
        <span
          title={plural(strays, {
            one: '# file more than 15 minutes from the rest of this jump — the gap rule would not have put it here',
            other:
              '# files more than 15 minutes from the rest of this jump — the gap rule would not have put them here'
          })}
          className='self-start rounded border border-dashed border-changed bg-changed-soft px-1.5 font-mono text-[10px] leading-4 font-semibold text-changed'>
          ⧗ {t`${strays} off the gap`}
        </span>
      )}
      {/* a jump says when it started; loose files have no one moment, and say what they are */}
      {group ? (
        <span className='font-mono text-[11.5px] text-ink-2 tabular-nums'>
          {dateLabel(from)} · {hhmm(from)}
        </span>
      ) : (
        <span className='text-[11.5px] text-ink-2 italic'>{t`in no jump`}</span>
      )}
      <span className='text-[11.5px] text-ink-3'>{counts(section.files)}</span>
      {frames.length > 0 && (
        <span className='pointer-events-none grid grid-cols-4 gap-1'>
          {frames.map((f) => (
            <img
              key={f.id ?? f.path}
              src={getPictureUrl(f, proxies[f.path], 120)}
              alt=''
              loading='lazy'
              draggable={false}
              className='aspect-[4/3] w-full rounded-[3px] bg-line-2 object-cover'
            />
          ))}
        </span>
      )}
    </div>
  )
}

const FileBrowser = ({ sections, statusOf, jump, cards, empty, ...list }: Props) => {
  if (sections.length === 0)
    return (
      <div className='mt-3 rounded-[9px] border border-dashed border-line bg-pane px-4 py-7 text-center text-ink-3'>
        {empty}
      </div>
    )
  const files = (key: string, shown: ManifestFile[]) => (
    <div
      key={`files:${key}`}
      className='rounded-lg border border-line bg-pane p-[7px]'>
      <FileList
        {...list}
        files={shown}
        selecting={list.picked.length > 0}
      />
    </div>
  )

  /* By jump: every jump a card side by side, and under them the open one's files. Nothing repeats
     the card in a bar above them — what the jump is, and what can be done to it, is in the panel on
     the right. Only a montage's next step stays here, beside the files it acts on. */
  const cardSections = cardsOf(sections)
  if (cards && cardSections.length > 0) {
    const open = cardSections.find((s) => s.key === cards.open) ?? cardSections[0]!
    return (
      <div className='@container'>
        {!cards.hidden && (
          <div className='mt-3 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2'>
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
          aria-label={open.kind === 'jump' ? open.label : t`Loose files`}
          className='mt-3 flex flex-col gap-2'>
          {open.kind === 'jump' && jump.actions?.(open.group) && (
            <div className='flex flex-wrap items-center gap-2'>{jump.actions(open.group)}</div>
          )}
          {open.kind === 'jump' && jump.above?.(open.group)}
          {!(open.kind === 'jump' && open.group.freed) && files(open.key, open.files)}
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
          {!(section.kind === 'jump' && section.group.freed) && files(section.key, section.files)}
        </section>
      ))}
    </div>
  )
}

export { FileBrowser }
export type { JumpControls }
