import * as fs from 'node:fs'
import * as path from 'node:path'
import { XMLBuilder } from 'fast-xml-parser'
import { z } from 'zod'
import { XML_OPTIONS, attrsOf, walkAssets } from './lib/mlt'
import { walkFiles } from './lib/fs'
import { readTemplate } from './montage'

/* Putting a brought-in template's own files back within reach.
 *
 * A template is made on somebody's machine and names its music and its logos where they sat on that
 * machine — `/home/them/Videos/club/logo.png`. Carried here, every one of those paths is a file
 * this machine has not got, and the template arrives whole but reads as missing everything.
 *
 * So the moment one is brought in, the project is read and each file it names is looked for among
 * the files that came with it, by name, and written back as the way from the project to that file.
 * The template then says where its files are in its own terms and goes on saying it wherever the
 * folder is copied afterwards.
 *
 * A file nothing was uploaded for is left exactly as the project wrote it: it is missing, which is
 * a thing to be told about, not a thing to be papered over with a path to nowhere.
 */

/* Every file that came with the template, by the name it ends in — which is what a project names
   its files by, whatever folder they were in on the machine that made it. */
const filesBeside = (dir: string) => {
  const by = new Map<string, string>()
  for (const file of walkFiles(dir)) {
    const name = path.basename(file)
    /* the shallowest wins, so a stray copy deeper in cannot take a name from the real one */
    const held = by.get(name)
    if (!held || file.split(path.sep).length < held.split(path.sep).length) by.set(name, file)
  }
  return by
}

/* The way from the project to one of its files, said the way a project says it: with forward
   slashes, whatever the machine. Nothing above the template's own folder is ever pointed at. */
const wayTo = (dir: string, target: string) => path.relative(dir, target).split(path.sep).join('/')

type Relinked = { relinked: string[]; missing: string[] }

/* Reads the project, points every file it names at the copy that came with it, and writes it back.
   Returns what moved and what is still not here, in the words the board uses for both. */
const relinkTemplate = (projectPath: string): Relinked => {
  const { document, mltNode, mlt } = readTemplate(projectPath)
  const dir = path.dirname(projectPath)
  const beside = filesBeside(dir)
  const relinked: string[] = []
  const missing: string[] = []

  /* Where this file is now, or null when it is to be left alone: already pointing at what came with
     it, or nothing here answers to that name. */
  const wayToItsCopy = (named: string) => {
    const name = path.basename(named)
    const here = beside.get(name)
    if (!here) {
      if (!missing.includes(name)) missing.push(name)
      return null
    }
    const way = wayTo(dir, here)
    if (way === named) return null
    if (!relinked.includes(name)) relinked.push(name)
    return way
  }

  walkAssets(mlt, wayToItsCopy)

  /* The folder the machine that made this counted from. Every file now says its own way from the
     project, so what is recorded here is one more thing that was true somewhere else — and left in
     place it is what an editor counts from first. */
  const recorded = attrsOf(mltNode)['@_root']
  if (recorded !== undefined && recorded !== '') attrsOf(mltNode)['@_root'] = ''

  /* A template already saying where its own files are is left as its owner wrote it, down to the
     spacing: writing it back would say it again in this parser's words and nothing else. */
  if (relinked.length === 0 && (recorded === undefined || recorded === ''))
    return { relinked, missing }

  const built = z
    .string()
    .parse(
      new XMLBuilder({ ...XML_OPTIONS, format: true, suppressEmptyNode: true }).build(document)
    )
  fs.writeFileSync(
    projectPath,
    built.startsWith('<?xml') ? built : `<?xml version='1.0' encoding='utf-8'?>\n${built}`,
    'utf-8'
  )
  return { relinked, missing }
}

export { relinkTemplate }
