// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { editorCommand, editorParts, openInEditor, tokenize } from '../src/editor'
import { createTmpDir, onPlatform } from './fixtures'

describe('opening the project in the editor', () => {
  let dir: string
  let project: string
  const saved = process.env.SKYDOCK_EDITOR_COMMAND

  beforeEach(() => {
    dir = createTmpDir('skydock-editor-')
    project = path.join(dir, 'passenger.kdenlive')
    fs.writeFileSync(project, '<mlt/>')
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.SKYDOCK_EDITOR_COMMAND
    else process.env.SKYDOCK_EDITOR_COMMAND = saved
    vi.unstubAllEnvs()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reads the command the way a shell reads one', () => {
    expect(tokenize('kdenlive')).toEqual(['kdenlive'])
    expect(tokenize('flatpak run org.kde.kdenlive')).toEqual(['flatpak', 'run', 'org.kde.kdenlive'])
    expect(tokenize('sh -c "echo hi > /tmp/x"')).toEqual(['sh', '-c', 'echo hi > /tmp/x'])
    expect(tokenize(String.raw`sh -c "echo \"$0\" >> /tmp/x"`)).toEqual([
      'sh',
      '-c',
      'echo "$0" >> /tmp/x'
    ])
    expect(tokenize('/opt/My Editor/bin/run')).toEqual(['/opt/My', 'Editor/bin/run'])
    expect(tokenize('"/opt/My Editor/bin/run"')).toEqual(['/opt/My Editor/bin/run'])
    expect(tokenize('sh -c "oops')).toBeNull()
  })

  it('runs a quoted command with the project as its argument', async () => {
    const log = path.join(dir, 'editor.log')
    process.env.SKYDOCK_EDITOR_COMMAND = String.raw`sh -c "printf '%s' \"$0\" > ${log}"`

    const result = await openInEditor(project)
    expect(result.opened).toBe(true)
    await expect
      .poll(() => (fs.existsSync(log) ? fs.readFileSync(log, 'utf-8') : null), { timeout: 4000 })
      .toBe(project)
  })

  it('defaults to kdenlive', () => {
    delete process.env.SKYDOCK_EDITOR_COMMAND
    expect(editorCommand()).toBe('kdenlive')
  })

  it('finds the editor where each system keeps it', () => {
    delete process.env.SKYDOCK_EDITOR_COMMAND
    const installed = path.join(dir, 'Programs', 'kdenlive', 'bin', 'kdenlive.exe')
    fs.mkdirSync(path.dirname(installed), { recursive: true })
    fs.writeFileSync(installed, '')
    vi.stubEnv('LOCALAPPDATA', dir)

    onPlatform('linux', () => expect(editorParts()).toEqual(['kdenlive']))
    onPlatform('darwin', () => expect(editorParts()).toEqual(['open', '-a', 'kdenlive']))
    onPlatform('win32', () => expect(editorParts()).toEqual([installed]))
  })

  it('runs the configured command against the project, and says so', async () => {
    const receipt = path.join(dir, 'opened.txt')
    const stub = path.join(dir, 'fake-editor')
    fs.writeFileSync(stub, `#!/bin/sh\nprintf '%s' "$1" > ${JSON.stringify(receipt)}\n`)
    fs.chmodSync(stub, 0o755)
    process.env.SKYDOCK_EDITOR_COMMAND = stub

    const result = await openInEditor(project)
    expect(result.opened).toBe(true)

    await expect
      .poll(() => (fs.existsSync(receipt) ? fs.readFileSync(receipt, 'utf-8') : null), {
        timeout: 4000
      })
      .toBe(project)
  })

  it('says what is wrong rather than throwing when the editor is not on this machine', async () => {
    process.env.SKYDOCK_EDITOR_COMMAND = 'definitely-not-installed-anywhere'
    const result = await openInEditor(project)
    expect(result.opened).toBe(false)
    expect(result.reason).toContain('SKYDOCK_EDITOR_COMMAND')
  })

  it('reports an editor that starts and gives up, with what it said', async () => {
    const stub = path.join(dir, 'dying-editor')
    fs.writeFileSync(stub, '#!/bin/sh\necho "cannot open display" >&2\nexit 1\n')
    fs.chmodSync(stub, 0o755)
    process.env.SKYDOCK_EDITOR_COMMAND = stub

    const result = await openInEditor(project)
    expect(result.opened).toBe(false)
    expect(result.reason).toContain('stopped straight away')
    expect(result.reason).toContain('cannot open display')
  })

  it('waits for a command that takes its time to say the editor never came up', async () => {
    const stub = path.join(dir, 'slow-bridge')
    fs.writeFileSync(
      stub,
      '#!/bin/sh\nsleep 1.6\necho "the machine would not start it" >&2\nexit 1\n'
    )
    fs.chmodSync(stub, 0o755)
    process.env.SKYDOCK_EDITOR_COMMAND = stub

    const result = await openInEditor(project)

    expect(result.opened).toBe(false)
    expect(result.reason).toContain('the machine would not start it')
  })

  it('counts handing the file to an editor already open as opened', async () => {
    const stub = path.join(dir, 'handoff-editor')
    fs.writeFileSync(stub, '#!/bin/sh\nexit 0\n')
    fs.chmodSync(stub, 0o755)
    process.env.SKYDOCK_EDITOR_COMMAND = stub

    const result = await openInEditor(project)
    expect(result.opened).toBe(true)
  })

  it('refuses a project that is not there', async () => {
    const result = await openInEditor(path.join(dir, 'missing.kdenlive'))
    expect(result.opened).toBe(false)
    expect(result.reason).toContain('No project at')
  })
})
