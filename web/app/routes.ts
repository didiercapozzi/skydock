import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

/* The board is one screen with a rail of folders down the side, and every folder — and every file
   opened in it — has its own address, so a page can be reloaded, kept or sent to somebody and comes
   back showing the same thing. The board itself is the layout: it holds the data and draws the
   screen, and these children carry what the address says — which folder, and which file is open in
   it. */
const routes = [
  layout('routes/board.tsx', [
    index('routes/place.home.tsx'),
    route(':kind/:name?', 'routes/place.tsx', [route('file/:fileId', 'routes/place.file.tsx')])
  ]),
  route('api/manifest', 'routes/api.manifest.ts'),
  route('api/nas', 'routes/api.nas.ts'),
  route('api/scan', 'routes/api.scan.ts'),
  route('api/camera', 'routes/api.camera.ts'),
  route('api/import', 'routes/api.import.ts'),
  route('api/templates', 'routes/api.templates.ts'),
  route('api/upload-progress', 'routes/api.upload-progress.ts'),
  route('api/events', 'routes/api.events.ts'),
  route('api/remote-files', 'routes/api.remote-files.ts'),
  route('api/storage-folder', 'routes/api.storage-folder.ts'),
  route('api/share-link', 'routes/api.share-link.ts'),
  route('api/storage-file/*', 'routes/api.storage-file.$.ts'),
  route('api/file/*', 'routes/api.file.$.tsx'),
  route('api/thumb/*', 'routes/api.thumb.$.tsx'),
  route('api/track/*', 'routes/api.track.$.ts')
] satisfies RouteConfig

export default routes
