import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("jump/:date/:jumpDir", "routes/jump.tsx"),
] satisfies RouteConfig;
