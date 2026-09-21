import { type RouteConfig, index, route } from '@react-router/dev/routes'

const routes = [
  index('routes/board.tsx'),
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
  route('api/storage-file/*', 'routes/api.storage-file.$.ts'),
  route('api/file/*', 'routes/api.file.$.tsx'),
  route('api/thumb/*', 'routes/api.thumb.$.tsx'),
  route('api/track/*', 'routes/api.track.$.ts')
] satisfies RouteConfig

export default routes
