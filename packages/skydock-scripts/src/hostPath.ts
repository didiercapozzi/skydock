import * as fs from 'node:fs'
import * as path from 'node:path'

const MOUNTINFO = '/proc/self/mountinfo'

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
    return []
  }
}

const isInside = (child: string, parent: string) =>
  child === parent || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`)

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
