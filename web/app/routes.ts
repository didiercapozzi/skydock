import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

const routes = [
  layout('routes/board.tsx', [
    index('routes/place.home.tsx'),
    route(':kind/:name?', 'routes/place.tsx', [route('file/:fileId', 'routes/place.file.tsx')])
  ]),
  route('api/manifest', 'routes/api.manifest.ts'),
  route('api/nas', 'routes/api.nas.ts'),
  route('api/scan', 'routes/api.scan.ts'),
  route('api/camera', 'routes/api.camera.ts'),
  route('api/camera-file', 'routes/api.camera-file.ts'),
  route('api/bin', 'routes/api.bin.ts'),
  route('api/busy', 'routes/api.busy.ts'),
  route('api/import', 'routes/api.import.ts'),
  route('api/dropped', 'routes/api.dropped.ts'),
  route('api/templates', 'routes/api.templates.ts'),
  route('api/transfers', 'routes/api.transfers.ts'),
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
