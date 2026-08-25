import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('review', 'routes/review.tsx'),
  route('jump/:date/:jumpDir', 'routes/jump.tsx'),
  route('api/file', 'routes/api.file.ts'),
  route('api/library', 'routes/api.library.ts'),
  route('api/jump', 'routes/api.jump.ts'),
  route('api/open', 'routes/api.open.ts'),
  route('api/simulate', 'routes/api.simulate.ts'),
  route('api/manifest', 'routes/api.manifest.ts')
] satisfies RouteConfig
