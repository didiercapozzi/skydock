import { remembered } from './remembered'

const choice = remembered<string>({
  key: 'skydock.template',
  fallback: '',
  from: (stored) => stored
})

const setTemplateChoice = choice.set
const useTemplateChoice = choice.use

export { setTemplateChoice, useTemplateChoice }
