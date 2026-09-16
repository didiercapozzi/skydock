import * as fs from 'node:fs'
import * as path from 'node:path'

/* SkyDock may run in a container while kdenlive runs on the machine the container sits on. The same
   bytes live under two different paths, so a project file written with container paths opens with
   every clip missing. Only the generated project needs host paths — SkyDock keeps reading and
   writing its own. */

const MOUNTINFO = '/proc/self/mountinfo'

/* In /proc/self/mountinfo, field 4 is the mount's root inside its filesystem and field 5 the mount
   point. A bind of the repo reads `… /home/capo/Documents/skydock /workspace rw …`, which is the
   whole mapping. Longest mount point first, so a mount nested inside another answers for its own
   subtree. */
const readMounts = () => {
  try {
    return fs
      .readFileSync(MOUNTINFO, 'utf-8')
      .split('\n')
      .flatMap((line) => {
        const [, , , root, point] = line.split(' ')
        return root && point && point !== '/' && root !== '/' ? [{ root, point }] : []
      })
      .sort((a, b) => b.point.length - a.point.length)
  } catch {
    /* not Linux, or no procfs: there is nothing to detect, and identity is the right answer */
    return []
  }
}

const isInside = (child: string, parent: string) =>
  child === parent || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`)

/* The root field is relative to its own filesystem rather than to the host's `/`. It is the host
   path whenever the bind source shares a filesystem with the host root, which is the ordinary case;
   SKYDOCK_HOST_OUTPUT_DIR is how to say it does not. */
const detectHostPath = (target: string) => {
  const mount = readMounts().find((m) => isInside(target, m.point))
  return mount ? path.join(mount.root, path.relative(mount.point, target)) : null
}

const toHostPath = (target: string, outputDir: string) => {
  const override = process.env.SKYDOCK_HOST_OUTPUT_DIR?.trim()
  if (override && isInside(target, outputDir))
    return path.join(override, path.relative(outputDir, target))
  return detectHostPath(target) ?? target
}

export { toHostPath }
