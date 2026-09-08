import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('api/manifest', 'routes/api.manifest.ts'),
  route('api/nas', 'routes/api.nas.ts'),
  route('api/file/*', 'routes/api.file.$.tsx'),
  route('api/thumb/*', 'routes/api.thumb.$.tsx')
] satisfies RouteConfig
