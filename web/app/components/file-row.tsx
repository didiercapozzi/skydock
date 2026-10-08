import { t } from '@lingui/core/macro'
import { createElement } from 'react'
import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'

/* A file as the board draws it everywhere — in a destination, a montage, the bin, a camera's card, the
   storage: one row, so a file looks the same wherever it is listed. A tick (or a lock where it cannot
   move, or nothing where there is nothing to pick it for), its picture, its name with what is worth
   knowing under it, and where it has got to. What differs from place to place is what each says in those
   places, never how the row is built. */

/* the columns of a row: tick, picture, the name with what it is under it, and where it has got to */
const COLUMNS =
  'grid grid-cols-[22px_64px_minmax(0,1fr)_auto] content-center items-center gap-x-3.5 gap-y-1 px-3'

/* The row's own frame. The one looked at is marked apart from the picked ones by a ring round it. */
const frameOf = (picked: boolean, previewed: boolean, clickable: boolean, menu: boolean) =>
  `${COLUMNS} w-full text-left ${menu ? '' : '[content-visibility:auto]'} h-16.5 rounded-corner pr-5 [contain-intrinsic-size:auto_66px] ${
    previewed
      ? 'bg-accent-soft shadow-ring-2'
      : picked
        ? 'bg-accent-soft shadow-card'
        : `bg-pane shadow-card ${clickable ? 'hover:bg-accent-soft' : ''}`
  }`

/* a file's box: blue with a tick once picked, an empty one to say it can be */
const Tick = ({
  picked,
  label,
  onPick
}: {
  picked: boolean
  label?: string
  onPick: () => void
}) => (
  <button
    type='button'
    aria-label={label ?? (picked ? t`Unpick` : t`Pick`)}
    aria-pressed={picked}
    onClick={(e) => {
      e.stopPropagation()
      onPick()
    }}
    className={`grid size-5 place-items-center rounded-corner border-2 p-0 ${
      picked
        ? 'border-pick bg-pick text-white'
        : 'border-check bg-transparent text-transparent hover:border-pick'
    }`}>
    <Icon
      name='check'
      size={11}
      weight={3.5}
    />
  </button>
)

/* a file that cannot move has nothing to be picked for, so it has no tick — a lock in its place says
   why, and keeps the rows in line */
const Lock = ({ why }: { why: string }) => (
  <span
    className='grid cursor-help place-items-center text-ink-3'
    title={why}>
    <Icon
      name='lock'
      size={13}
    />
  </span>
)

/* the frame a picture stands in */
const Picture = ({ children }: { children?: ReactNode }) => (
  <span className='relative grid h-11 w-16 place-items-center overflow-hidden rounded-corner bg-well'>
    {children}
  </span>
)

/* a file's picture, cut from the file itself */
const Thumb = ({ src, style }: { src: string; style?: CSSProperties }) => (
  <img
    src={src}
    alt=''
    loading='lazy'
    decoding='async'
    style={style}
    className='h-full w-full object-cover'
  />
)

/* what stands where a picture would, for a file there is no picture of here: on the storage, say */
const Mark = ({ icon }: { icon: IconName }) => (
  <Icon
    name={icon}
    size={18}
    className='text-ink-3'
  />
)

/* where a file has got to, as a small tinted badge with a dot — the one look every state wears, whatever
   lists it */
const State = ({
  tone,
  children,
  ring = false,
  dot = true,
  bare = false,
  title
}: {
  /* the colour the state wears in its word and its dot, as the palette names it: the pill itself is white */
  tone: string
  children: ReactNode
  /* the dot drawn as a ring, for the state that asks to be dealt with */
  ring?: boolean
  dot?: boolean
  /* just the word and its dot, with no pill round them, where it stands over a quiet line of its own */
  bare?: boolean
  title?: string
}) => (
  <span
    title={title}
    className={`inline-flex h-6 w-max flex-none items-center gap-1.5 rounded-full text-small font-semibold whitespace-nowrap capitalize ${
      dot
        ? `before:size-1.5 before:rounded-full before:content-[''] ${ring ? 'before:shadow-ring-current' : 'before:bg-current'}`
        : ''
    } ${bare ? '' : 'bg-pane px-3 shadow-hairline'} ${tone}`}>
    {children}
  </span>
)

type Frame = Omit<HTMLAttributes<HTMLElement>, 'children'> & { href?: string }

const FileRow = ({
  picked = false,
  previewed = false,
  pick,
  locked,
  picture,
  name,
  nameTitle,
  meta,
  trailing,
  when,
  href,
  menu = false,
  ...frame
}: Frame & {
  picked?: boolean
  previewed?: boolean
  /* the tick's own answer; none, and there is nothing to pick the file for */
  pick?: { label?: string; onPick: () => void }
  /* why a file cannot be picked, said by the lock that stands in place of the tick */
  locked?: string | null
  picture: ReactNode
  name: ReactNode
  nameTitle?: string
  /* what is worth knowing of it, under the name */
  meta?: ReactNode
  /* where it has got to, and what can be done to it from here */
  trailing?: ReactNode
  /* when it was shot, under where it has got to, level with what is under the name */
  when?: ReactNode
  /* a menu in the row opens over the rows below it, which a row kept out of drawing until it is seen would cut off */
  menu?: boolean
}) => {
  const Root: ElementType = href ? 'a' : 'div'
  const tick = locked ? (
    <Lock why={locked} />
  ) : pick ? (
    <Tick
      picked={picked}
      label={pick.label}
      onPick={pick.onPick}
    />
  ) : (
    <span />
  )
  const label = (
    <span
      className='block truncate font-mono text-small font-medium tracking-title text-ink'
      title={nameTitle}>
      {name}
    </span>
  )
  const details = meta && (
    <span className='flex min-w-0 items-center gap-1 truncate text-small font-medium text-ink-3 [&>*+*]:before:mr-1 [&>*+*]:before:text-ink-3 [&>*+*]:before:content-["·"]'>
      {meta}
    </span>
  )
  const trail = 'flex min-w-28 items-center justify-end gap-2'
  return createElement(
    Root,
    {
      ...frame,
      ...(href ? { href, target: '_blank', rel: 'noreferrer' } : {}),
      className: frameOf(picked, previewed, Boolean(frame.onClick || href), menu)
    },
    /* with a time under the state, the row is two lines: the name beside the state, what is under
       the name beside the time, and the tick and the picture stand across both */
    when ? (
      <>
        <span className='row-span-2 grid place-items-center'>{tick}</span>
        <span className='row-span-2 grid place-items-center'>
          <Picture>{picture}</Picture>
        </span>
        <span className='col-start-3 min-w-0'>{label}</span>
        <span className={`col-start-4 ${trail}`}>{trailing}</span>
        <span className='col-start-3 min-w-0'>{details}</span>
        <span className='col-start-4 flex items-center justify-end text-small font-medium text-ink-3 tabular-nums'>
          {when}
        </span>
      </>
    ) : (
      <>
        {tick}
        <Picture>{picture}</Picture>
        <span className='min-w-0'>
          {label}
          {details}
        </span>
        <span className={trail}>{trailing}</span>
      </>
    )
  )
}

/* A run of files under its own heading: what it is, how many, and — said quietly — whatever else is
   worth knowing of it. Rows stand one above the other, a card each. */
const FileGroup = ({
  title,
  count,
  about,
  children
}: {
  title?: ReactNode
  count?: ReactNode
  about?: ReactNode
  children: ReactNode
}) => (
  <section className='flex flex-col'>
    {(title || count) && (
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1 pt-3.5 pb-2.5'>
        <h3 className='m-0 flex flex-wrap items-baseline gap-x-3 text-lead font-bold text-ink'>
          {title}
          {count && <span className='text-body font-medium text-ink-3'>{count}</span>}
        </h3>
        {about}
      </div>
    )}
    <div className='flex flex-col gap-2'>{children}</div>
  </section>
)

export { FileGroup, FileRow, Mark, Picture, State, Thumb }
