import { useLocation, useNavigate } from 'react-router'
import { FilmEditor } from '../components/film-editor'
import type { Route } from './+types/film-template'

const FilmTemplate = ({ params }: Route.ComponentProps) => {
  const navigate = useNavigate()
  const { key } = useLocation()
  return (
    <FilmEditor
      template={params.name}
      onClose={() => (key === 'default' ? navigate('/', { replace: true }) : navigate(-1))}
    />
  )
}

export default FilmTemplate
