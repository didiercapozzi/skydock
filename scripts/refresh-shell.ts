import * as asar from '@electron/asar'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'

const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..')
const archive = path.join(root, 'build', 'installers', 'linux-unpacked', 'resources', 'app.asar')
const built = path.join(root, 'build', 'electron')

if (!fs.existsSync(archive)) {
  console.error('There is no unpacked app to put them in — run npm run installers:dev first.')
  process.exit(1)
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-shell-'))
try {
  asar.extractAll(archive, work)
  fs.cpSync(built, path.join(work, 'build', 'electron'), { recursive: true })
  await asar.createPackage(work, `${archive}.new`)
  fs.renameSync(`${archive}.new`, archive)
  console.log(
    '[SkyDock] the window files are in the unpacked app — close the window and open it again'
  )
} finally {
  fs.rmSync(work, { recursive: true, force: true })
}
