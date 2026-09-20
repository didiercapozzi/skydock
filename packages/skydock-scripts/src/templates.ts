import * as childProcess from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Unzip, UnzipInflate } from 'fflate'
import { editorParts } from './editor'
import { walkFiles } from './lib/fs'
import { availableTemplates, inspectTemplate } from './montage'
import type { TemplateFact } from './templateEntry'
import { run } from './tools'

/* The editing templates this machine has, what each is made of, and how one is brought in.

   A template is somebody's branding — the music, the logos, the titles a passenger's film is dressed
   in — so none is ever picked silently, none is ever written over, and one with holes in it says so
   before an edit is started on it rather than at the render. */

/* year and month, which is how kdenlive numbers itself: 24.12.1 is December 2024 */
const parseVersion = (text: string | null) => {
  const found = text ? /(\d+)\.(\d+)/.exec(text) : null
  return found ? { year: Number(found[1]), month: Number(found[2]) } : null
}

/* A project from a newer kdenlive than the one opening it is the case that bites: the editor may
   refuse it, or open it with pieces missing. One from a much older kdenlive is converted on opening,
   which mostly works and is worth a look. A year or so either way is nothing. */
const versionGap = (template: string | null, editor: string | null): TemplateFact['gap'] => {
  const made = parseVersion(template)
  const opens = parseVersion(editor)
  if (!made || !opens) return null
  if (made.year > opens.year || (made.year === opens.year && made.month > opens.month))
    return 'newer'
  return opens.year - made.year >= 2 ? 'older' : null
}

/* Which kdenlive will open the projects: whatever opens them is asked, whether that is the editor
   itself or the command that reaches one on another machine. Not knowing is an answer — no warning
   is made up from it. */
const editorVersion = () => {
  const program = editorParts()?.[0]
  if (!program) return null
  try {
    const said = childProcess
      .execFileSync(program, ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      .trim()
    return parseVersion(said) ? said : null
  } catch {
    return null
  }
}

const listTemplates = (outputDir: string) => {
  const editor = editorVersion()
  const templates = availableTemplates(outputDir).map((template): TemplateFact => {
    try {
      const { version, assets, missing } = inspectTemplate(template.path)
      return {
        name: template.name,
        version,
        assets: assets.length,
        missing,
        gap: versionGap(version, editor)
      }
    } catch {
      return { name: template.name, version: null, assets: 0, missing: [], gap: null }
    }
  })
  return { templates, editorVersion: editor }
}

/* a name that is one folder and nothing else */
const folderNameOf = (raw: string) =>
  raw
    .replace(/\.(kdenlive|zip|tgz|tar\.gz|tar)$/i, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/^\.+/, '')
    .trim()

/* an entry that would land outside the folder it is unpacked into */
const escapes = (entry: string) =>
  path.isAbsolute(entry) || entry.split(/[\\/]/).includes('..') || entry.includes('\0')

const unzipInto = async (archive: string, dir: string) => {
  const failures: string[] = []
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  unzip.onfile = (file) => {
    if (escapes(file.name)) {
      failures.push(`${file.name} would land outside the template's folder`)
      return
    }
    if (file.name.endsWith('/')) return
    const target = path.join(dir, file.name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const fd = fs.openSync(target, 'w')
    file.ondata = (error, chunk, final) => {
      if (error) failures.push(`${file.name}: ${error.message}`)
      else fs.writeSync(fd, chunk)
      if (error || final) fs.closeSync(fd)
    }
    file.start()
  }
  for await (const chunk of fs.createReadStream(archive)) unzip.push(chunk, false)
  unzip.push(new Uint8Array(0), true)
  if (failures.length > 0) throw new Error(failures[0])
}

const untarInto = async (archive: string, dir: string) => {
  const listed = await run('tar', ['-tf', archive])
  if (!listed.ok) throw new Error('The archive cannot be read as a tar archive.')
  const bad = listed.stdout.split('\n').find((entry) => entry && escapes(entry))
  if (bad) throw new Error(`${bad} would land outside the template's folder`)
  const unpacked = await run('tar', ['-xf', archive, '-C', dir, '--no-same-owner'])
  if (!unpacked.ok) throw new Error('The archive could not be unpacked.')
}

/* A template brought in from a kdenlive archive — the project with the music, logos and titles it
   uses, as the editor's own "Archive project" packs them, zipped or tarred — or from a bare project
   file. It is unpacked aside, the project found in it, and only then given its place, so a bad
   archive leaves nothing behind. Every file the project names is then looked for and the ones not
   found are named: the template is kept either way, since an edit can start without the music, but
   nobody should find that out at the render. One already there under that name is never replaced. */
const importTemplate = async ({
  outputDir,
  archive,
  filename,
  name
}: {
  outputDir: string
  /* the file as it arrived, on this machine's disk */
  archive: string
  /* what it was called where it came from, which says what kind of file it is */
  filename: string
  name?: string
}) => {
  const root = path.join(outputDir, 'templates')
  const folder = folderNameOf(name?.trim() || filename)
  if (!folder) throw new Error('Give the template a name.')
  const home = path.join(root, folder)
  if (fs.existsSync(home))
    throw new Error(`There is already a template called ${folder} — give this one another name.`)

  const staging = path.join(root, `.incoming-${crypto.randomUUID()}`)
  fs.mkdirSync(staging, { recursive: true })
  try {
    if (/\.kdenlive$/i.test(filename)) fs.copyFileSync(archive, path.join(staging, filename))
    else if (/\.zip$/i.test(filename)) await unzipInto(archive, staging)
    else if (/\.(tgz|tar\.gz|tar)$/i.test(filename)) await untarInto(archive, staging)
    else
      throw new Error('A template is a .zip or .tar.gz kdenlive archive, or a .kdenlive project.')

    /* the project nearest the top; an archive made by the editor holds exactly one */
    const project = walkFiles(staging)
      .filter((f) => f.endsWith('.kdenlive'))
      .sort((a, b) => a.split(path.sep).length - b.split(path.sep).length || a.localeCompare(b))[0]
    if (!project) throw new Error('There is no kdenlive project in that archive.')
    fs.renameSync(path.dirname(project), home)
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
  const made = listTemplates(outputDir).templates.find((t) => t.name === folder)
  if (!made) throw new Error('The template was unpacked but cannot be read as one.')
  return made
}

export { importTemplate, listTemplates, versionGap }
