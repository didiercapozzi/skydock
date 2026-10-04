import { remembered } from './remembered'

const column = remembered<boolean>({
  key: 'skydock.details',
  fallback: false,
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
