import { DEFAULT_KEYS, parseKeys, type FilmKeys } from '../helpers/filmKeys'
import { remembered } from './remembered'

const keys = remembered<FilmKeys>({
  key: 'skydock.filmKeys',
  fallback: DEFAULT_KEYS,
  from: parseKeys,
  to: JSON.stringify
})

const setFilmKeys = keys.set
const useFilmKeys = keys.use

export { setFilmKeys, useFilmKeys }
