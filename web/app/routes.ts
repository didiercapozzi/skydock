import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('routes/board.tsx'),
  route('classic', 'routes/home.tsx'),
  route('api/manifest', 'routes/api.manifest.ts'),
  route('api/nas', 'routes/api.nas.ts'),
  route('api/scan', 'routes/api.scan.ts'),
  route('api/import-file', 'routes/api.import-file.ts'),
  route('api/upload-progress', 'routes/api.upload-progress.ts'),
  route('api/remote-files', 'routes/api.remote-files.ts'),
  route('api/create-montage', 'routes/api.create-montage.ts'),
  route('api/file/*', 'routes/api.file.$.tsx'),
  route('api/thumb/*', 'routes/api.thumb.$.tsx')
] satisfies RouteConfig
