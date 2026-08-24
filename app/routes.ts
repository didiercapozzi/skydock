import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('jump/:date/:jumpDir', 'routes/jump.tsx'),
  route('api/theory', 'routes/api.theory.ts'),
  route('api/jump', 'routes/api.jump.ts')
] satisfies RouteConfig
