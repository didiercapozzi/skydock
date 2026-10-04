import { hasCompletePassenger } from '@skydock/scripts'
import { useParams } from 'react-router'
import { PreviewHost } from '../components/preview-host'
import { placeFromParams } from '../helpers/places'
import { useSafeSearchParams } from '../helpers/routing'
import { boardViewSchema } from '../helpers/view'
import { useBoard } from '../hooks/useBoardModel'
import { usePreview } from '../hooks/usePreview'

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
    saving: board.saving,
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
