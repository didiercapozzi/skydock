const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

const VERSION_IN = {
  'package.json': /("version":\s*")([^"]+)(")/
}

type Versioned = keyof typeof VERSION_IN

const numbers = (version: string) => {
  const said = SEMVER.exec(version.trim())
  if (!said) throw new Error(`"${version}" is not a version of the shape 1.2.3`)
  return said.slice(1, 4).map(Number)
}

const nextVersion = (current: string, asked: string) => {
  const wanted = asked.trim()
  if (SEMVER.test(wanted)) return wanted
  const [major, minor, patch] = numbers(current)
  if (wanted === 'major') return `${major + 1}.0.0`
  if (wanted === 'minor') return `${major}.${minor + 1}.0`
  if (wanted === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`"${asked}" is neither patch, minor, major, nor a version of the shape 1.2.3`)
}

const versionIn = (text: string, file: Versioned) => {
  const said = VERSION_IN[file].exec(text)
  if (!said) throw new Error(`${file} no longer says which version this is`)
  return said[2]
}

const withVersion = (text: string, file: Versioned, version: string) => {
  numbers(version)
  versionIn(text, file)
  return text.replace(
    VERSION_IN[file],
    (_said, before, _was, after) => `${before}${version}${after}`
  )
}

const tagOf = (version: string) => `v${version}`

const versionedFiles = () => Object.keys(VERSION_IN) as Versioned[]

export { nextVersion, tagOf, versionIn, versionedFiles, withVersion }
