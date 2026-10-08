import { remembered } from './remembered'

/* Whether the panel on the right is drawn (RULES, The board). Two choices, because it is two
   different things: beside the files it is a column that is there until put away, and that
   is remembered on this machine; on a narrow window it is a drawer that is shut until asked for, and
   that is only for this visit. A page starts without it, calm: it comes by itself when a file or a jump
   is picked, and on a montage's page, whose panel is where it is worked on. */
const from = (stored: string) => (stored === 'open' ? true : stored === 'shut' ? false : null)
const to = (open: boolean) => (open ? 'open' : 'shut')

const column = remembered<boolean>({
  key: 'skydock.details',
  fallback: false,
  from,
  to
})

const drawer = remembered<boolean>({
  key: 'skydock.detailsDrawer',
  fallback: false,
  from,
  to,
  kept: 'session'
})

const useDetailsColumn = column.use
const setDetailsColumn = column.set
const useDetailsDrawer = drawer.use
const setDetailsDrawer = drawer.set

export { setDetailsColumn, setDetailsDrawer, useDetailsColumn, useDetailsDrawer }
