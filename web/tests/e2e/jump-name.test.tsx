import { createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import type { FileStatus } from '@skydock/scripts'
import { JumpPanel, ManyPanel } from '../../app/components/inspector'
import type { ManifestFile, ManifestGroup } from '../../app/components/types'


const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 5).getTime() / 1000)
const AT_FIELD = '2026-08-01T10:00:05'

const clip = (id: string, mtime: number): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime
})

const PICKED = [clip('a', AT), clip('b', AT + 60)]

const LOCAL: FileStatus = 'local'

const inRouter = (element: ReactElement) => {
  const Stub = createRoutesStub([{ path: '/', Component: () => element }])
  return render(createElement(Stub, { initialEntries: ['/'] }))
}

const renderPicked = async () => {
  const onMakeJump = vi.fn()
  await inRouter(
    createElement(ManyPanel, {
      files: PICKED,
      statusOf: () => LOCAL,
      onSendBack: () => {},
      backLabel: 'Send back',
      onMakeJump,
      onClear: () => {}
    })
  )
  return { onMakeJump }
}

describe('making a jump of files picked in Fresh files', () => {
  const makeJump = () => userEvent.click(page.getByRole('button', { name: /Make a jump of these/ }))

  test('asks only for when it started, filled in as shot', async () => {
    await renderPicked()

    await makeJump()

    await expect.element(page.getByLabelText('Started')).toHaveValue(AT_FIELD)
    await expect.element(page.getByLabelText('Name')).not.toBeInTheDocument()
  })

  test('makes the jump from the start it was given', async () => {
    const { onMakeJump } = await renderPicked()
    await makeJump()

    await userEvent.fill(page.getByLabelText('Started'), '2026-08-01T18:30')
    await userEvent.click(page.getByRole('button', { name: 'Make the jump' }))

    expect(onMakeJump).toHaveBeenCalledWith(Math.floor(new Date(2026, 7, 1, 18, 30, 0).getTime() / 1000))
  })

  test('leaving the start as it is still makes the jump', async () => {
    const { onMakeJump } = await renderPicked()
    await makeJump()

    await userEvent.click(page.getByRole('button', { name: 'Make the jump' }))

    expect(onMakeJump).toHaveBeenCalledWith(AT)
  })

  test('Escape makes nothing', async () => {
    const { onMakeJump } = await renderPicked()
    await makeJump()

    await userEvent.click(page.getByLabelText('Started'))
    await userEvent.keyboard('{Escape}')

    expect(onMakeJump).not.toHaveBeenCalled()
    await expect.element(page.getByLabelText('Started')).not.toBeInTheDocument()
  })
})

const jump = (group: Partial<ManifestGroup> = {}): ManifestGroup => ({
  id: 'g1',
  label: 'g1',
  day: '01.08.2026',
  files: PICKED,
  ...group
})

const renderJump = async (group: ManifestGroup) => {
  const onRename = vi.fn()
  await inRouter(
    createElement(JumpPanel, {
      group,
      label: group.name ?? 'Jump 1',
      locked: null,
      statusOf: () => LOCAL,
      passengers: [],
      onNameMontage: () => {},
      onName: () => {},
      onSelectFiles: () => {},
      onRename
    })
  )
  return { onRename }
}

describe('renaming a jump', () => {
  test('comes back with the name it already has', async () => {
    await renderJump(jump({ name: 'Sunset load' }))

    await userEvent.click(page.getByRole('button', { name: 'Sunset load' }))

    await expect.element(page.getByLabelText('Name')).toHaveValue('Sunset load')
    await expect.element(page.getByLabelText('Started')).not.toBeInTheDocument()
  })

  test('keeps the day apart from the name, so only the name renames', async () => {
    await renderJump(jump({ name: 'Sunset load' }))

    await expect
      .element(page.getByRole('button', { name: 'Sunset load', exact: true }))
      .toBeInTheDocument()
    await userEvent.click(page.getByText('1 Aug', { exact: true }))

    await expect.element(page.getByLabelText('Name')).not.toBeInTheDocument()
  })

  test('saves the new name', async () => {
    const { onRename } = await renderJump(jump())

    await userEvent.click(page.getByRole('button', { name: 'Jump 1' }))
    await userEvent.fill(page.getByLabelText('Name'), 'Sunset boogie')
    await userEvent.keyboard('{Enter}')

    expect(onRename).toHaveBeenCalledWith('Sunset boogie')
  })
})
