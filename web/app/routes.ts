import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('demo', 'routes/demo.tsx'),
  route('jump/:date/:jumpDir', 'routes/jump.tsx'),
  route('api/file', 'routes/api.file.ts'),
  route('api/library', 'routes/api.library.ts'),
  route('api/jump', 'routes/api.jump.ts'),
  route('api/open', 'routes/api.open.ts'),
  route('api/simulate', 'routes/api.simulate.ts'),
  route('api/scan', 'routes/api.scan.ts'),
  route('api/manifest', 'routes/api.manifest.ts'),
  route('api/status', 'routes/api.status.ts'),
  route('api/stream', 'routes/api.stream.ts'),
  route('api/hls', 'routes/api.hls.ts'),
  route('api/duration', 'routes/api.duration.ts')
] satisfies RouteConfig
