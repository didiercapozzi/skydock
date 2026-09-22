/* Makes a release: moves the version, tags it, and lets GitHub build the installers.
 *
 *   npm run release           # the next patch — 0.1.0 becomes 0.1.1
 *   npm run release minor     # 0.1.0 becomes 0.2.0
 *   npm run release 1.0.0     # exactly that
 *   npm run release -- patch --here   # everything but the push, to look at first
 *
 * The tag is the whole of it: pushing one starts the build, which makes an installer on a machine
 * of each kind and hangs them on a draft release. Nothing is published until somebody presses
 * publish, so a release can be looked at, or thrown away, before anyone else sees it.
 *
 * What is refused here is what cannot be undone once pushed: a version that says something other
 * than the app does, a tag that already exists, or work that was never committed and so is not in
 * what gets built.
 */
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import {
  nextVersion,
  tagOf,
  versionIn,
  versionedFiles,
  withVersion
} from '../packages/skydock-scripts/src/release'

const repo = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..')

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf-8' }).trim()

const loudly = (program: string, args: string[]) =>
  execFileSync(program, args, { cwd: repo, stdio: 'inherit' })

const stop = (said: string) => {
  console.error(`\n${said}\n`)
  process.exit(1)
}

const asked = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const here = process.argv.includes('--here')

/* Everything that is not committed is not in what gets built, and a release made from a working
   copy is a release nobody can make again. */
if (git('status', '--porcelain') !== '')
  stop('There is work that is not committed. Commit it or put it aside, then release.')

const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
if (branch !== 'main') stop(`Releases are made from main, and this is ${branch}.`)

const files = versionedFiles()
const text = Object.fromEntries(
  files.map((file) => [file, fs.readFileSync(path.join(repo, file), 'utf-8')])
)
const said = files.map((file) => versionIn(text[file], file))
if (new Set(said).size > 1)
  stop(
    `The files disagree about which version this is:\n${files.map((file, at) => `  ${said[at]}  ${file}`).join('\n')}`
  )

const current = said[0]
const version = nextVersion(current, asked[0] ?? 'patch')
const tag = tagOf(version)
if (git('tag', '--list', tag) !== '') stop(`${tag} has been released already.`)

console.log(`[SkyDock] ${current} → ${version}`)

/* The checks before the tag rather than after it: a tag is pushed once, and a release that will not
   build is found here for the price of half a minute. */
loudly('npm', ['run', 'check'])

for (const file of files) {
  fs.writeFileSync(path.join(repo, file), withVersion(text[file], file, version))
  console.log(`           ${file}`)
}

git('add', ...files)
git('commit', '-m', `release: ${tag}`)
git('tag', '-a', tag, '-m', `SkyDock ${version}`)

if (here) {
  console.log(`\n[SkyDock] ${tag} is made but not pushed. When it looks right:\n`)
  console.log('           git push --follow-tags origin main\n')
  console.log(`           Undo it with: git tag -d ${tag} && git reset --hard HEAD~1\n`)
} else {
  loudly('git', ['push', '--follow-tags', 'origin', 'main'])
  console.log(`\n[SkyDock] ${tag} is away. The installers are being built:`)
  console.log('           https://github.com/didiercapozzi/skydock/actions\n')
  console.log('           They land on a draft release, which nobody sees until it is published.\n')
}
