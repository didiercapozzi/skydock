import type { FileStatus, ProxyFact, StatusContext } from '@skydock/scripts'
import { dayLabel } from '../helpers/jumps'
import type { Section } from '../helpers/sections'
import { FileList, kindOf } from './file-list'
import type { FileShape, Kind, Modifiers } from './file-list'
import { JumpSpan } from './jump-time'
import { PlaceSelect } from './place-select'
import type { Target } from './place-select'
import type { Destination, ManifestFile, ManifestGroup } from './types'
import { calendarDay, minFileMtime, plural, shortDate } from './utils'

/* Every file of a folder on screen at once, under headers that stay pinned while their files scroll
   by, so what is on screen always says which jump or which day it belongs to. Nothing folds: a long
   folder is scrolled, searched or grouped differently, never opened piece by piece. */

type JumpControls = {
  selected: string | null
  frozen: Set<string>
  overTarget: string | null
  busy: boolean
  places: Destination[]
  /* the passengers this jump could join, and where it is now */
  passengersFor: (group: ManifestGroup) => string[]
  targetOf: (group: ManifestGroup) => Target | null
  dropTarget: (groupId: string) => Record<string, unknown>
  onSelect: (groupId: string) => void
  onDrag: (groupId: string) => void
  onShift: (groupId: string, anchorEpoch: number) => void
  onFileTo: (groupId: string, target: Target) => void
  /* what a tandem's header offers — its one next step — and what shows above its files */
  actions?: (group: ManifestGroup) => React.ReactNode
  above?: (group: ManifestGroup) => React.ReactNode
  /* a whole folder's jumps across several days carry their day beside their name */
  withDay: boolean
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
  onDragFile: (file: ManifestFile, e?: React.DragEvent) => void
  jump: JumpControls
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
  if (local > 0) return <Tag tone='local'>{`${local} to process`}</Tag>
  if (processed > 0) return <Tag tone='proc'>{`${processed} to upload`}</Tag>
  return <Tag tone='up'>uploaded</Tag>
}

const counts = (files: ManifestFile[]) => {
  const videos = files.filter((f) => kindOf(f) === 'video').length
  return `${plural(videos, 'video')} · ${plural(files.length - videos, 'photo')}`
}

const HEAD =
  'sticky top-0 z-[3] mt-3 mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border px-3 py-2 shadow-card'

/* A jump's line: when it started (which can be corrected), what it is, how far it has got, where it
   is filed — which it can be refiled from, in one choice — and, for a tandem, its next step. Clicking
   anywhere on it that is not a control selects the jump; dragging it files the whole jump. */
const JumpHeader = ({
  group,
  label,
  statusOf,
  jump
}: {
  group: ManifestGroup
  label: string
  statusOf: (file: ManifestFile) => FileStatus
  jump: JumpControls
}) => {
  const from = minFileMtime(group.files) ?? 0
  const to = group.files.reduce((n, f) => Math.max(n, f.mtime), 0)
  const frozen = jump.frozen.has(group.id)
  const selected = jump.selected === group.id
  const over = jump.overTarget === `group:${group.id}`
  return (
    <div
      {...jump.dropTarget(group.id)}
      role='button'
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${label}, ${counts(group.files)}`}
      draggable={!frozen}
      onDragStart={(e) => {
        if (e.target !== e.currentTarget) return
        e.stopPropagation()
        jump.onDrag(group.id)
      }}
      onClick={(e) => {
        if (
          e.target instanceof HTMLElement &&
          e.target.closest('button, input, select, a, label, textarea')
        )
          return
        jump.onSelect(group.id)
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        jump.onSelect(group.id)
      }}
      title={
        frozen
          ? 'Click to see this jump'
          : 'Click to see this jump · drag this line onto a folder to file the whole jump · drop files here to add them'
      }
      className={`${HEAD} ${frozen ? 'cursor-pointer' : 'cursor-grab'} ${
        over
          ? 'border-dashed border-pick bg-pick-soft'
          : selected
            ? 'border-pick bg-pick-soft'
            : 'border-line bg-pane'
      }`}>
      {group.freed || group.files.length === 0 ? null : (
        <JumpSpan
          from={from}
          to={to}
          withDate={calendarDay(from) !== calendarDay(to)}
          disabled={jump.busy || frozen}
          onShift={(at) => jump.onShift(group.id, at)}
        />
      )}
      <span className='text-[13px] font-semibold text-ink'>{label}</span>
      <span className='text-[12px] text-ink-3'>
        {jump.withDay ? `${shortDate(from)} · ` : ''}
        {counts(group.files)}
      </span>
      {group.freed ? (
        <Tag tone='lock'>on the storage only</Tag>
      ) : frozen ? (
        <Tag tone='lock'>🔒 has an edit</Tag>
      ) : (
        progressTag(group.files, statusOf)
      )}
      <span className='flex-1' />
      {!frozen && (
        <PlaceSelect
          label='File to'
          current={jump.targetOf(group)}
          places={jump.places}
          passengers={jump.passengersFor(group)}
          disabled={jump.busy}
          onPick={(target) => jump.onFileTo(group.id, target)}
        />
      )}
      {jump.actions?.(group)}
    </div>
  )
}

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
      {loose ? 'Loose files' : dayLabel(day)}
    </span>
    <span className='text-[12px] text-ink-3'>
      {loose ? `${dayLabel(day)} · in no jump · ` : ''}
      {counts(files)}
    </span>
    {progressTag(files, statusOf)}
  </div>
)

const FileBrowser = ({ sections, statusOf, jump, empty, ...list }: Props) => {
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
  return (
    <div className='@container'>
      {sections.map((section) => (
        <section
          key={section.key}
          aria-label={section.kind === 'jump' ? section.label : undefined}>
          {section.kind === 'jump' && (
            <JumpHeader
              group={section.group}
              label={section.label}
              statusOf={statusOf}
              jump={jump}
            />
          )}
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
