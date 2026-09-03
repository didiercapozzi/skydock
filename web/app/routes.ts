import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('api/manifest', 'routes/api.manifest.ts')
] satisfies RouteConfig
