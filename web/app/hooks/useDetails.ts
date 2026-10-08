import { remembered } from './remembered'

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
