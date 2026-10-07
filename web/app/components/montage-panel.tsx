import { t } from '@lingui/core/macro'
import {
  UPLOADED_LOCKED,
  hasCompletePassenger,
  isVideoFile,
  passengerName,
  slugOf
} from '@skydock/scripts'
import { useState } from 'react'
import { parcelsOfGroup } from '../helpers/parcels'
import { useBoard } from '../hooks/useBoardModel'
import { Danger, Mini } from './buttons'
import { Part, Who } from './inspector'
import { JumpSpan } from './jump-time'
import { kindsSaid } from './kinds'
import { PassengerName } from './montage-card'
import type { Passenger } from './montage-card'
import type { ManifestGroup } from './types'
import { dateLabel, dayShort, hhmm, minFileMtime, shortDate } from './utils'

/* The panel of a montage, which says what the page does not: when it starts and who it is for while there
   is work to do; its link and where each part went once it is delivered; what was sent and to whom once it
   is done. The steps are the page's, not repeated here. */

/* a fact, one line: what it is, muted, at the left; what it says, bold, at the right */
const Line = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className='flex min-w-0 items-baseline justify-between gap-3 border-t border-line-2 py-2.5 text-lead first:border-t-0'>
    <span className='flex-none text-ink-3'>{label}</span>
    <b className='min-w-0 truncate text-right'>{children}</b>
  </div>
)

const Heading = ({ children }: { children: string }) => <h3 className='m-0 eyebrow'>{children}</h3>

const MontagePanel = ({
  group,
  locked,
  passengers,
  onName,
  onShift
}: {
  group: ManifestGroup
  locked: string | null
  passengers: Passenger[]
  onName: (firstname: string, lastname: string) => void
  /* when it started, set right — absent when the jump is past changing */
  onShift?: (anchorEpoch: number) => void
}) => {
  const model = useBoard()
  const { board } = model
  const [renaming, setRenaming] = useState(false)
  const named = hasCompletePassenger(group.passenger)
  const who = passengerName(group.passenger)
  const from = minFileMtime(group.files) ?? 0
  const to = group.files.reduce((n, f) => Math.max(n, f.mtime), 0)
  const videos = group.files.filter((f) => isVideoFile(f.path)).length
  const emailed = model.emailedOn(group)
  const parcels = group.uploaded ? parcelsOfGroup(group, board.places) : []
  const handed = parcels.find((p) => p.handed) ?? parcels[0]
  const originals = parcels.find((p) =>
    p.items.some((item) => item.what.includes(t`the originals`))
  )
  const shareUrl = group.uploaded?.shareUrl ?? group.publish?.shareUrl
  const link = (make: boolean) =>
    handed &&
    board.send(`link:${handed.dir}`, {
      intent: 'montage-link',
      link: { folder: handed.dir, make }
    })
  const busy = board.busy !== null
  const sub = group.freed
    ? t`Freed from this machine`
    : group.uploaded
      ? emailed
        ? t`Uploaded · emailed ${shortDate(emailed.at)}`
        : t`Uploaded · not emailed yet`
      : `${shortDate(from)} · ${kindsSaid(videos, group.files.length - videos, ' · ')}`

  return (
    <>
      <Who
        eyebrow={t`Montage`}
        lower
        title={who || t`No name yet`}
        sub={sub}
      />
      {group.uploaded && (
        <>
          {group.freed ? (
            <>
              <Part>
                <Heading>{t`Delivery`}</Heading>
                <div>
                  {group.freed && emailed && (
                    <>
                      <Line label={t`Emailed`}>{dayShort(emailed.at)}</Line>
                      {emailed.to && <Line label={t`To`}>{emailed.to}</Line>}
                    </>
                  )}
                  {handed && <Line label={group.freed ? t`Film in` : t`Film`}>{handed.title}</Line>}
                  {originals && (
                    <Line label={group.freed ? t`Originals in` : t`Originals`}>
                      {originals.title}
                    </Line>
                  )}
                </div>
              </Part>
              <Part>
                <Heading>{t`Link`}</Heading>
                {shareUrl ? (
                  <>
                    {!group.freed && (
                      <div className='truncate border-t border-line-2 pt-2.5 font-mono text-small'>
                        {shareUrl.replace(/^https?:\/\/[^/]+/, '…')}
                      </div>
                    )}
                    <span className='flex gap-2'>
                      <Mini
                        title={t`Copy the link`}
                        onClick={() =>
                          void navigator.clipboard?.writeText(shareUrl).catch(() => undefined)
                        }>
                        {t`Copy link`}
                      </Mini>
                      <Mini
                        disabled={busy}
                        title={t`Take the link away — the folder stays where it is`}
                        onClick={() => link(false)}>
                        {t`Remove link`}
                      </Mini>
                    </span>
                  </>
                ) : (
                  <span className='flex items-center gap-3'>
                    <span className='text-body text-ink-3'>{t`No link`}</span>
                    <Mini
                      disabled={busy}
                      title={t`Make a link to its folder, to send`}
                      onClick={() => link(true)}>
                      {t`Create link`}
                    </Mini>
                  </span>
                )}
              </Part>
            </>
          ) : (
            <>
              <Part>
                <Heading>{t`Link`}</Heading>
                {shareUrl ? (
                  <>
                    {!group.freed && (
                      <div className='truncate border-t border-line-2 pt-2.5 font-mono text-small'>
                        {shareUrl.replace(/^https?:\/\/[^/]+/, '…')}
                      </div>
                    )}
                    <span className='flex gap-2'>
                      <Mini
                        title={t`Copy the link`}
                        onClick={() =>
                          void navigator.clipboard?.writeText(shareUrl).catch(() => undefined)
                        }>
                        {t`Copy link`}
                      </Mini>
                      <Mini
                        disabled={busy}
                        title={t`Take the link away — the folder stays where it is`}
                        onClick={() => link(false)}>
                        {t`Remove link`}
                      </Mini>
                    </span>
                  </>
                ) : (
                  <span className='flex items-center gap-3'>
                    <span className='text-body text-ink-3'>{t`No link`}</span>
                    <Mini
                      disabled={busy}
                      title={t`Make a link to its folder, to send`}
                      onClick={() => link(true)}>
                      {t`Create link`}
                    </Mini>
                  </span>
                )}
              </Part>
              <Part>
                <Heading>{t`Delivery`}</Heading>
                <div>
                  {group.freed && emailed && (
                    <>
                      <Line label={t`Emailed`}>{dayShort(emailed.at)}</Line>
                      {emailed.to && <Line label={t`To`}>{emailed.to}</Line>}
                    </>
                  )}
                  {handed && <Line label={group.freed ? t`Film in` : t`Film`}>{handed.title}</Line>}
                  {originals && (
                    <Line label={group.freed ? t`Originals in` : t`Originals`}>
                      {originals.title}
                    </Line>
                  )}
                </div>
              </Part>
            </>
          )}
          <div className='mt-auto px-6 pt-4 pb-6'>
            {group.freed ? (
              <p className='m-0 text-small text-ink-3'>
                {t`Bring back fetches one file onto this machine again. Nothing is deleted from the storage.`}
              </p>
            ) : (
              <Mini
                disabled={busy}
                title={t`Zip the photos and the rushes, then send the film and the photos to the montage’s folder`}
                onClick={() => model.takeStep(group, 'Uploaded')}>
                {t`Upload again…`}
              </Mini>
            )}
          </div>
        </>
      )}
      {!group.uploaded && (
        <>
          <Part>
            <Heading>{t`Starts`}</Heading>
            {onShift && group.files.length > 0 ? (
              <JumpSpan
                from={from}
                to={to}
                withDate
                big
                disabled={false}
                onShift={onShift}
              />
            ) : (
              <span className='text-body tabular-nums'>{`${dateLabel(from)} ${hhmm(from)}`}</span>
            )}
          </Part>
          {locked && locked !== UPLOADED_LOCKED && (
            <Part>
              <p className='m-0 flex gap-2.5 rounded-corner bg-well px-3 py-2.5 text-small text-ink-2'>
                {locked}
              </p>
            </Part>
          )}
          <Part>
            <Heading>{t`Who it is for`}</Heading>
            {!named || (renaming && !locked) ? (
              <PassengerName
                key={group.id}
                group={group}
                passengers={passengers}
                onSave={(first, last) => {
                  setRenaming(false)
                  onName(first, last)
                }}
              />
            ) : (
              <div>
                <Line label={t`Name`}>{who}</Line>
                <Line label={t`Folder`}>
                  <span className='font-mono text-small font-medium'>{slugOf(who)}</span>
                </Line>
                {!locked && (
                  <div className='pt-1'>
                    <Mini onClick={() => setRenaming(true)}>{t`Change the name`}</Mini>
                  </div>
                )}
              </div>
            )}
          </Part>
        </>
      )}
      {!group.freed && !group.uploaded && <WaysBack who={who} />}
    </>
  )
}

/* a montage's two ways back, for all of it — each asks first — at the foot of its panel */
const WaysBack = ({ who }: { who: string }) => {
  const { board, setDialog } = useBoard()
  const busy = board.busy !== null
  return (
    <div className='mt-auto flex flex-col gap-2 px-6 pt-4 pb-6'>
      <Heading>{t`Ways back`}</Heading>
      <span className='flex flex-wrap items-center gap-2'>
        <Mini
          disabled={busy}
          title={t`Back to before processing — keeps the name, the trims, the frames and the times`}
          onClick={() => setDialog({ kind: 'take-back', mode: 'reset', who })}>
          {t`Reset…`}
        </Mini>
        <Danger
          size='mini'
          disabled={busy}
          title={t`Undo the montage, at any step — its files go back to Fresh files, loose, without their name or trims`}
          onClick={() => setDialog({ kind: 'take-back', mode: 'delete', who })}>
          {t`Delete montage…`}
        </Danger>
      </span>
    </div>
  )
}

export { MontagePanel }
