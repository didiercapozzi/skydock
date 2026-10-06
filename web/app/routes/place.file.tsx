import { hasCompletePassenger, type Moment } from '@skydock/scripts'
import { useEffect, useRef } from 'react'
import { useParams } from 'react-router'
import { PreviewHost } from '../components/preview-host'
import type { ManifestFile } from '../components/types'
import { placeFromParams } from '../helpers/places'
import { useSafeSearchParams } from '../helpers/routing'
import { boardViewSchema } from '../helpers/view'
import { useBoard } from '../hooks/useBoardModel'
import { usePreview } from '../hooks/usePreview'

/* One file, open in the folder it belongs to: /dropzone/yverdon/file/<the file>. It is an address of
   its own, which is what makes an open clip something to reload, to come back from, or to send to
   somebody — and it draws the file over the folder, which stays as it was behind it. It carries how
   that folder is being looked at, as the folder's own address does, so closing the clip leaves the
   folder exactly as it was. */
const searchParamsArgs = boardViewSchema

type Send = ReturnType<typeof useBoard>['board']['send']

const setMoment = (send: Send, file: ManifestFile, which: Moment, seconds: number) =>
  send('moment', { intent: 'set-moment', fileIds: [file.id ?? ''], moment: { which, seconds } })

const PreviewedFile = () => {
  const model = useBoard()
  const { board } = model
  const address = useParams()
  const { searchParams: looking } = useSafeSearchParams(boardViewSchema)
  const preview = usePreview({
    groups: board.groups,
    loose: board.loose,
    place: placeFromParams(address),
    fileId: address.fileId,
    view: looking,
    saving: board.saving,
    onGroupsChange: board.updateGroups,
    onFileCrop: model.cropLoneFile
  })
  /* A mark dragged along the timeline moves many times a second, and a request sent over one still
     under way abandons it half read. So one is sent at a time: what is moved meanwhile waits, only the
     latest, and goes the moment the one before has been answered. */
  const waiting = useRef<{ file: ManifestFile; which: Moment; seconds: number } | null>(null)
  const momentBusy = board.busy === 'moment'
  useEffect(() => {
    if (momentBusy || !waiting.current) return
    const { file, which, seconds } = waiting.current
    waiting.current = null
    setMoment(board.send, file, which, seconds)
  }, [momentBusy, board])
  return (
    <PreviewHost
      preview={preview}
      proxies={board.proxies}
      statusContext={model.statusContext}
      montage={hasCompletePassenger(
        board.groups.find((g) => g.id === preview.preview?.groupId)?.passenger
      )}
      onMomentChange={(file, which, seconds) => {
        if (momentBusy) waiting.current = { file, which, seconds }
        else setMoment(board.send, file, which, seconds)
      }}
      onMomentsRedo={(file) =>
        board.send('moment', { intent: 'redo-moments', fileIds: [file.id ?? ''] })
      }
      onMomentsReset={(file) =>
        board.send('moment', { intent: 'reset-moments', fileIds: [file.id ?? ''] })
      }
      onPlayOutside={(file) =>
        board.send(`play:${file.id ?? file.path}`, {
          intent: 'play-file',
          fileIds: [file.id ?? '']
        })
      }
    />
  )
}

export { searchParamsArgs }
export default PreviewedFile
