import { t } from '@lingui/core/macro'
import { createElement } from 'react'
import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'

const COLUMNS = 'grid grid-cols-[22px_64px_minmax(0,1fr)_auto] items-center gap-x-3.5 px-3'

const frameOf = (
  picked: boolean,
  previewed: boolean,
  joined: boolean,
  clickable: boolean,
  menu: boolean
) =>
  `${COLUMNS} w-full text-left ${menu ? '' : '[content-visibility:auto]'} ${
    joined
      ? `h-13 rounded-corner [contain-intrinsic-size:auto_52px] not-first:border-t not-first:border-line-2 ${
          previewed || picked ? 'bg-accent-soft' : clickable ? 'hover:bg-well' : ''
        }`
      : `h-16.5 rounded-corner pr-5 [contain-intrinsic-size:auto_66px] ${
          previewed
            ? 'bg-accent-soft shadow-ring-2'
            : picked
              ? 'bg-accent-soft shadow-card'
              : `bg-pane shadow-card ${clickable ? 'hover:bg-accent-soft' : ''}`
        }`
  }`

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
        ? 'border-accent bg-accent text-white'
        : 'border-check bg-transparent text-transparent hover:border-accent'
    }`}>
    <Icon
      name='check'
      size={11}
      weight={3.5}
    />
  </button>
)

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

const Picture = ({ joined, children }: { joined: boolean; children?: ReactNode }) => (
  <span
    className={`relative grid place-items-center overflow-hidden bg-well ${joined ? 'h-control w-11.5 rounded-corner' : 'h-11 w-16 rounded-corner'}`}>
    {children}
  </span>
)

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

const Mark = ({ icon }: { icon: IconName }) => (
  <Icon
    name={icon}
    size={18}
    className='text-ink-3'
  />
)

const State = ({
  tone,
  children,
  ring = false,
  dot = true,
  title
}: {
  tone: string
  children: ReactNode
  ring?: boolean
  dot?: boolean
  title?: string
}) => (
  <span
    title={title}
    className={`inline-flex h-6 w-max flex-none items-center gap-1.5 rounded-full px-3 text-small font-semibold whitespace-nowrap capitalize ${
      dot
        ? `before:size-1.5 before:rounded-full before:content-[''] ${ring ? 'before:shadow-ring-current' : 'before:bg-current'}`
        : ''
    } ${tone}`}>
    {children}
  </span>
)

type Frame = Omit<HTMLAttributes<HTMLElement>, 'children'> & { href?: string }

const FileRow = ({
  picked = false,
  previewed = false,
  joined = false,
  pick,
  locked,
  picture,
  name,
  nameTitle,
  meta,
  trailing,
  href,
  menu = false,
  ...frame
}: Frame & {
  picked?: boolean
  previewed?: boolean
  joined?: boolean
  pick?: { label?: string; onPick: () => void }
  locked?: string | null
  picture: ReactNode
  name: ReactNode
  nameTitle?: string
  meta?: ReactNode
  trailing?: ReactNode
  menu?: boolean
}) => {
  const Root: ElementType = href ? 'a' : 'div'
  return createElement(
    Root,
    {
      ...frame,
      ...(href ? { href, target: '_blank', rel: 'noreferrer' } : {}),
      className: frameOf(picked, previewed, joined, Boolean(frame.onClick || href), menu)
    },
    locked ? (
      <Lock why={locked} />
    ) : pick ? (
      <Tick
        picked={picked}
        label={pick.label}
        onPick={pick.onPick}
      />
    ) : (
      <span />
    ),
    <Picture joined={joined}>{picture}</Picture>,
    <span className='min-w-0'>
      <span
        className='block truncate font-mono text-small font-medium tracking-title text-ink'
        title={nameTitle}>
        {name}
      </span>
      {meta && (
        <span className='flex min-w-0 items-center gap-1 truncate text-small font-medium text-ink-3 [&>*+*]:before:mr-1 [&>*+*]:before:text-ink-3 [&>*+*]:before:content-["·"]'>
          {meta}
        </span>
      )}
    </span>,
    <span className='flex min-w-28 items-center justify-end gap-2'>{trailing}</span>
  )
}

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
