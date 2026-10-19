import { flushBoardChanges, getManifestPath, getOutputDir, readRecordAsync } from '@skydock/scripts'
import { useLocation, useNavigate } from 'react-router'
import { FilmEditor } from '../components/film-editor'
import { placeHref, placeOfGroup } from '../helpers/places'
import type { Route } from './+types/edit'

const loader = async ({ params }: Route.LoaderArgs) => {
  const manifestPath = getManifestPath(getOutputDir())
  await flushBoardChanges(manifestPath)
  const { manifest } = await readRecordAsync(manifestPath)
  const group = manifest?.groups.find((g) => g.id === params.groupId)
  return {
    groupId: params.groupId,
    day: group?.day,
    back: placeHref(group ? placeOfGroup(group) : { kind: 'montages' })
  }
}

const Edit = ({ loaderData }: Route.ComponentProps) => {
  const navigate = useNavigate()
  const { key } = useLocation()
  return (
    <FilmEditor
      groupId={loaderData.groupId}
      day={loaderData.day}
      onClose={() =>
        key === 'default' ? navigate(loaderData.back, { replace: true }) : navigate(-1)
      }
    />
  )
}

export { loader }
export default Edit
