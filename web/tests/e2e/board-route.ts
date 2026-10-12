import Board from '../../app/routes/board'
import PreviewedFile from '../../app/routes/place.file'
import Home from '../../app/routes/place.home'
import Place from '../../app/routes/place'

const boardRoute = (loader: () => unknown) => ({
  path: '/',
  Component: Board,
  loader,
  children: [
    { index: true, Component: Home },
    {
      path: ':kind/:name?',
      Component: Place,
      children: [{ path: 'file/:fileId', Component: PreviewedFile }]
    }
  ]
})

const boardOf = (over: Record<string, unknown> = {}) => ({
  groups: [] as unknown[],
  looseFiles: [] as unknown[],
  destinations: [] as unknown[],
  outputs: {},
  proxies: {},
  montages: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, backupFolder: null },
  ...over
})

export { boardOf, boardRoute }
