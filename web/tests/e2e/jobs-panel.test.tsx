import { createElement } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { JobsPanel } from '../../app/components/jobs-panel'
import { liveJobs } from '../../app/hooks/liveStore'
import type { Job } from '../../app/hooks/useLiveProgress'

/* Everything SkyDock does beside the board is one panel in the corner (RULES, Principles): what it is, how
   far through, the file under way with a bar of its own — and the reason, until it is put away, when it
   is refused. */

const GB = 1024 ** 3

const put = (job: Partial<Job> & Pick<Job, 'type'>) =>
  liveJobs.update(() => ({
    one: { id: 'one', label: '', stage: 'working', done: 0, total: 1, rows: [], ...job }
  }))

const realFetch = globalThis.fetch

afterEach(() => {
  liveJobs.update(() => ({}))
  vi.stubGlobal('fetch', realFetch)
})

describe('a file being brought back from the storage', () => {
  test('is shown going, with its name and how far through it is', async () => {
    put({
      type: 'bring',
      rows: [
        {
          key: 'a',
          name: 'yverdon_20260927_120500.mp4',
          size: 527_000_000,
          at: 'now',
          part: 0.4
        }
      ]
    })
    await render(createElement(JobsPanel))

    await expect.element(page.getByText('Bringing back from the storage')).toBeVisible()
    await expect.element(page.getByText('yverdon_20260927_120500.mp4')).toBeVisible()
    await expect
      .element(page.getByRole('progressbar', { name: 'Fetching yverdon_20260927_120500.mp4' }))
      .toBeVisible()
  })

  test('says why it failed, and can be put away', async () => {
    put({
      type: 'bring',
      stage: 'failed',
      reason: 'The storage answered 404 for /x/a.mp4.',
      rows: [{ key: 'a', name: 'a.mp4', size: 10, at: 'failed' }]
    })
    await render(createElement(JobsPanel))

    await expect.element(page.getByText('The storage answered 404 for /x/a.mp4.')).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Dismiss' }))
    await expect.element(page.getByText('Bringing back from the storage')).not.toBeInTheDocument()
  })
})

describe('files being deleted off a camera', () => {
  test('moves the whole bar with every file, says how big each is, and puts what has gone first, in green', async () => {
    put({
      type: 'camera-delete',
      total: 4,
      rows: [
        { key: '/cam/DCIM/A.MP4', name: 'A.MP4', size: GB, at: 'now', part: 0.2, phase: 'checking' },
        { key: '/cam/DCIM/B.MP4', name: 'B.MP4', size: GB, at: 'now', part: 0.5, phase: 'checked' },
        { key: '/cam/DCIM/C.MP4', name: 'C.MP4', size: GB, at: 'later', part: 0, phase: 'checking' },
        { key: '/cam/DCIM/D.MP4', name: 'D.MP4', size: GB, at: 'done', phase: 'done' }
      ]
    })
    await render(createElement(JobsPanel))

    /* (0.2 + 0.5 + 0 + 1) / 4 */
    await expect
      .element(page.getByRole('progressbar', { name: 'Deleted from the camera' }))
      .toHaveAttribute('aria-valuenow', '43')
    await expect.element(page.getByText('20% of 1.0 GB')).toBeVisible()
    await expect.element(page.getByText('C.MP4')).toBeVisible()
    await expect
      .poll(() => page.getByRole('listitem').elements()[0]?.textContent ?? '')
      .toContain('D.MP4')
    await expect
      .poll(() => page.getByRole('listitem').elements()[0]?.textContent ?? '')
      .toContain('moved to the bin')
    await expect.element(page.getByText('D.MP4', { exact: true })).toHaveClass('text-up')
  })
})

describe('freeing a montage', () => {
  test('says what it is checking, and the reason it was refused until it is put away', async () => {
    put({ type: 'free', label: 'Luc Favre', stage: 'checking', name: 'luc.mp4', total: 5 })
    await render(createElement(JobsPanel))
    await expect.element(page.getByText('Freeing Luc Favre')).toBeVisible()
    await expect.element(page.getByText('luc.mp4')).toBeVisible()

    put({
      type: 'free',
      label: 'Luc Favre',
      stage: 'failed',
      reason: 'luc.mp4 on the storage is not the file that was sent.'
    })
    await expect
      .element(page.getByText('luc.mp4 on the storage is not the file that was sent.'))
      .toBeVisible()
  })
})

/* An upload is shown while it goes, from whatever page is open: every item and where it has got to, and
   it can be cancelled at any moment (RULES, Uploading). */
describe('an upload going', () => {
  const sending: Parameters<typeof put>[0] = {
    type: 'upload',
    label: 'Luc Favre',
    phase: 'uploading',
    done: 1,
    total: 2,
    rows: [
      {
        key: 'zip',
        name: 'luc_favre.full.zip',
        size: 16 * GB,
        to: '/Backup/luc-favre',
        at: 'done',
        phase: 'sent'
      },
      {
        key: 'film',
        name: 'luc_favre.mp4',
        size: 3 * GB,
        to: '/SkyDock/Tandems/luc-favre',
        at: 'now',
        part: 1 / 3,
        phase: 'sending'
      },
      {
        key: 'photo',
        name: 'G0010003.JPG',
        size: 5 * 1024 ** 2,
        to: '/SkyDock/Tandems/luc-favre/photos',
        at: 'skipped',
        phase: 'there'
      }
    ]
  }
  const panel = () => page.getByRole('complementary', { name: 'Uploading Luc Favre' })
  const renderUpload = async (intents: string[] = []) => {
    put(sending)
    /* the panel asks the machine by its address, as the board does */
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      if (!String(url instanceof Request ? url.url : url).includes('/api/manifest'))
        return realFetch(url, init)
      intents.push((JSON.parse(String(init?.body)) as { intent: string }).intent)
      return Response.json({ ok: true })
    })
    await render(createElement(JobsPanel, { dsmHost: 'nas.local' }))
  }

  test('is shown with every item and where it has got to', async () => {
    await renderUpload()

    await expect.element(panel()).toBeVisible()
    await expect.element(panel().getByText('luc_favre.full.zip')).toBeVisible()
    await expect
      .element(panel().getByRole('progressbar', { name: 'Sending luc_favre.mp4' }))
      .toBeVisible()
    await expect.element(panel().getByText('already uploaded — not sent again')).toBeVisible()
  })

  test('offers Open in DSM only on what is up there already, not on what is going', async () => {
    await renderUpload()
    await expect.element(panel()).toBeVisible()

    await expect.element(panel().getByRole('link', { name: 'Open in DSM' }).first()).toBeVisible()
    expect(panel().getByRole('link', { name: 'Open in DSM' }).elements()).toHaveLength(2)
  })

  test('opens out to show each item whole, where it goes, and closes again', async () => {
    await renderUpload()
    await expect.element(panel()).toBeVisible()
    const small = panel().element().getBoundingClientRect().width
    await expect
      .element(panel().getByText('/SkyDock/Tandems/luc-favre/luc_favre.mp4'))
      .not.toBeInTheDocument()

    await userEvent.click(panel().getByRole('button', { name: 'Open it out to see more' }))

    await expect
      .element(panel().getByText('/SkyDock/Tandems/luc-favre/luc_favre.mp4'))
      .toBeVisible()
    expect(panel().element().getBoundingClientRect().width).toBeGreaterThan(small * 1.8)

    await userEvent.click(panel().getByRole('button', { name: 'Make it small again' }))
    expect(panel().element().getBoundingClientRect().width).toBeLessThan(small * 1.2)
  })

  test('can be cancelled at any moment', async () => {
    const intents: string[] = []
    await renderUpload(intents)

    await userEvent.click(panel().getByRole('button', { name: 'Cancel' }))

    await expect.poll(() => intents).toContain('cancel-upload')
    await expect.element(panel().getByRole('button', { name: 'Cancelling…' })).toBeDisabled()
  })
})
