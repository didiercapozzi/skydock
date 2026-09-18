import { Mini } from './buttons'
import { DayRow } from './day-row'
import type { DayRowProps } from './day-row'
import { dayLabel, dayOf, dayOfFile } from '../helpers/jumps'
import type { ManifestFile, ManifestGroup } from './types'
import { plural } from './utils'

/* The sorting area and a dropzone are lists of days. Above them, what is open and the ways to open
   and fold everything at once; each day is a row of its own. */
const DaysPane = ({
  grouped,
  days,
  shownDays,
  groups,
  looseFiles,
  query,
  jumps,
  regroup,
  row,
  onToggleDay,
  onCloseAll,
  action,
  strip
}: {
  /* the sorting area keeps its jumps; a dropzone's files are flat */
  grouped: boolean
  days: string[]
  shownDays: string[]
  groups: ManifestGroup[]
  looseFiles: ManifestFile[]
  query: string
  jumps: {
    count: number
    open: string[]
    isShut: (groupId: string) => boolean
    foldAll: (fold: boolean) => void
  }
  /* the loose files of the sorting area, and running the gap rule over them again */
  regroup?: { loose: number; busy: boolean; running: boolean; onRegroup: () => void }
  row: Omit<
    DayRowProps,
    'day' | 'label' | 'groups' | 'looseFiles' | 'open' | 'grouped' | 'onToggle' | 'action' | 'strip'
  >
  onToggleDay: (day: string) => void
  onCloseAll: () => void
  action: (day: string, groups: ManifestGroup[], looseFiles: ManifestFile[]) => React.ReactNode
  strip: React.ReactNode
}) => (
  <div className='mt-2'>
    {days.length > 0 && (
      <div className='mb-2 flex flex-wrap items-center gap-1.5'>
        <span className='mr-auto text-[12px] text-ink-2'>
          {grouped ? plural(jumps.count, 'jump') : plural(days.length, 'day')} ·{' '}
          {shownDays.length === 0
            ? 'all closed'
            : shownDays.length === 1
              ? `${dayLabel(shownDays[0]!)} open`
              : `${shownDays.length} days open`}
        </span>
        <Mini
          disabled={jumps.open.length === 0 || jumps.open.every(jumps.isShut)}
          title='Fold jumps down to their names — days opened afterwards open folded too'
          onClick={() => jumps.foldAll(true)}>
          Collapse jumps
        </Mini>
        <Mini
          disabled={jumps.open.length === 0 || !jumps.open.some(jumps.isShut)}
          title='Show the files of every jump, and of days opened afterwards'
          onClick={() => jumps.foldAll(false)}>
          Expand jumps
        </Mini>
        <Mini
          disabled={shownDays.length === 0}
          title='Fold every day down to one line'
          onClick={onCloseAll}>
          Close all days
        </Mini>
        {regroup && regroup.loose > 0 && (
          <Mini
            disabled={regroup.busy}
            title='Run the gap rule again over every loose file here'
            onClick={regroup.onRegroup}>
            {regroup.running ? 'Regrouping…' : `Regroup ${regroup.loose} loose`}
          </Mini>
        )}
      </div>
    )}
    {days.length === 0 && (
      <div className='rounded-[9px] border border-dashed border-line bg-pane px-4 py-7 text-center text-ink-3'>
        {query.trim()
          ? 'Nothing here matches that.'
          : 'Nothing here. Drag a jump onto this place in the menu to file it.'}
      </div>
    )}
    {days.map((day) => {
      const dayGroups = groups.filter((g) => dayOf(g) === day)
      const dayLoose = looseFiles.filter((f) => dayOfFile(f) === day)
      return (
        <DayRow
          key={day}
          {...row}
          day={day}
          label={dayLabel(day)}
          groups={dayGroups}
          looseFiles={dayLoose}
          open={shownDays.includes(day)}
          grouped={grouped}
          onToggle={() => onToggleDay(day)}
          action={action(day, dayGroups, dayLoose)}
          strip={strip}
        />
      )
    })}
  </div>
)

export { DaysPane }
