import { remembered } from './remembered'

const choice = remembered<string>({
  key: 'skydock.filmTemplate',
  fallback: '',
  from: (stored) => stored
})

const setFilmTemplateChoice = choice.set
const useFilmTemplateChoice = choice.use

export { setFilmTemplateChoice, useFilmTemplateChoice }
