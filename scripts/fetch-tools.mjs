import { execFileSync } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'

/* The ffmpeg and ffprobe the installers carry, fetched for the system being built for.
   Run: `node scripts/fetch-tools.mjs [folder]` — it prints the folder to hand to the build in
   SKYDOCK_TOOLS_DIR, which is what the release workflow does.

   They have to be builds that need nothing installed beside them: the whole point of an installer
   is a dropzone's machine with nothing on it. What each build is and where it comes from is here,
   in the open, because it is somebody else's program travelling inside ours. */

const here = path.dirname(url.fileURLToPath(import.meta.url))

/* Where each system's static build comes from. Some pack both programs together and some one
   each, which is all that differs: whatever comes out of the archive, the two are found in it by
   name. */
const SOURCES = {
  'x86_64-unknown-linux-gnu': {
    from: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz',
    archive: 'tar.xz'
  },
  'aarch64-unknown-linux-gnu': {
    from: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz',
    archive: 'tar.xz'
  },
  'x86_64-apple-darwin': {
    from: 'https://evermeet.cx/ffmpeg/getrelease/zip',
    archive: 'zip',
    /* evermeet packs one program per archive, so ffprobe is fetched on its own */
    each: {
      ffmpeg: 'https://evermeet.cx/ffmpeg/getrelease/zip',
      ffprobe: 'https://evermeet.cx/ffprobe/getrelease/zip'
    }
  },
  'aarch64-apple-darwin': {
    from: 'https://www.osxexperts.net/ffmpeg711arm.zip',
    archive: 'zip',
    each: {
      ffmpeg: 'https://www.osxexperts.net/ffmpeg711arm.zip',
      ffprobe: 'https://www.osxexperts.net/ffprobe711arm.zip'
    }
  },
  'x86_64-pc-windows-msvc': {
    from: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    archive: 'zip'
  }
}

const targetTriple = () => {
  const told = process.env.TAURI_ENV_TARGET_TRIPLE?.trim() || process.argv[3]?.trim()
  if (told) return told
  const said = execFileSync('rustc', ['-vV'], { encoding: 'utf-8' })
  const host = /^host:\s*(.+)$/m.exec(said)?.[1]?.trim()
  if (!host) throw new Error('rustc does not say what this machine is')
  return host
}

const download = async (from, to) => {
  console.error(`> fetching ${from}`)
  const answer = await fetch(from, { redirect: 'follow' })
  if (!answer.ok) throw new Error(`${from} answered ${answer.status}`)
  fs.writeFileSync(to, Buffer.from(await answer.arrayBuffer()))
}

/* every file in there, so a build whose folder is named after its version is still found */
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })

const takeOut = (staging, tool, triple, into) => {
  const called = triple.includes('windows') ? `${tool}.exe` : tool
  const found = walk(staging).find((file) => path.basename(file) === called)
  if (!found) throw new Error(`${called} is not in what was fetched`)
  const target = path.join(into, called)
  fs.copyFileSync(found, target)
  if (!triple.includes('windows')) fs.chmodSync(target, 0o755)
  const digest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')
  console.error(`[SkyDock] ${called}\n           sha256 ${digest}`)
}

const fetchInto = async (triple, into) => {
  const source = SOURCES[triple]
  if (!source) throw new Error(`Nothing is listed to fetch for ${triple}`)
  const wanted = source.each ?? { both: source.from }
  for (const [tool, from] of Object.entries(wanted)) {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-tools-'))
    try {
      const archive = path.join(staging, `tools.${source.archive}`)
      await download(from, archive)
      execFileSync('tar', ['-xf', archive, '-C', staging], { stdio: 'inherit' })
      fs.rmSync(archive, { force: true })
      for (const one of tool === 'both' ? ['ffmpeg', 'ffprobe'] : [tool])
        takeOut(staging, one, triple, into)
    } finally {
      fs.rmSync(staging, { recursive: true, force: true })
    }
  }
}

const triple = targetTriple()
const into = path.resolve(process.argv[2] ?? path.join(here, '..', 'src-tauri', 'tools'))
fs.mkdirSync(into, { recursive: true })
await fetchInto(triple, into)
/* the only thing on the output, so a workflow can read the folder straight off it */
console.log(into)
