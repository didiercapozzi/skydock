import { remembered } from './remembered'

/* Whether the panel on the right is drawn (RULES, The board). Two choices, because it is two
   different things: beside the files it is a column that is there until put away, and that
   is remembered on this machine; on a narrow window it is a drawer that is shut until asked for, and
   that is only for this visit. */
const column = remembered<boolean>({
  key: 'skydock.details',
  fallback: true,
  from: (stored) => (stored === 'open' ? true : stored === 'shut' ? false : null),
  to: (open) => (open ? 'open' : 'shut')
})

const drawer = remembered<boolean>({
  key: 'skydock.detailsDrawer',
  fallback: false,
  from: (stored) => (stored === 'open' ? true : stored === 'shut' ? false : null),
  to: (open) => (open ? 'open' : 'shut'),
  kept: 'session'
})

const useDetailsColumn = column.use
const setDetailsColumn = column.set
const useDetailsDrawer = drawer.use
const setDetailsDrawer = drawer.set

export { setDetailsColumn, setDetailsDrawer, useDetailsColumn, useDetailsDrawer }
