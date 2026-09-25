import { hasCompletePassenger } from '@skydock/scripts'
import { useParams } from 'react-router'
import { PreviewHost } from '../components/preview-host'
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
    onGroupsChange: board.updateGroups,
    onFileCrop: model.cropLoneFile
  })
  return (
    <PreviewHost
      preview={preview}
      proxies={board.proxies}
      statusContext={model.statusContext}
      montage={hasCompletePassenger(
        board.groups.find((g) => g.id === preview.preview?.groupId)?.passenger
      )}
      onMomentChange={(file, which, seconds) =>
        board.send('moment', {
          intent: 'set-moment',
          fileIds: [file.id ?? ''],
          moment: { which, seconds }
        })
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
