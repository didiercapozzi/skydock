import { remembered } from './remembered'

/* Which editing template was chosen last. A club mostly edits with one template, so the one picked
   for the last montage is the one offered for the next — offered, never applied by itself, unless
   one has been marked the usual. */
const choice = remembered<string>({
  key: 'skydock.template',
  fallback: '',
  from: (stored) => stored
})

const setTemplateChoice = choice.set
const useTemplateChoice = choice.use

export { setTemplateChoice, useTemplateChoice }
