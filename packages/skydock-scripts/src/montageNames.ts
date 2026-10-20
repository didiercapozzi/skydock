const filmNameOf = (baseName: string) => `${baseName}.mp4`

const EDIT_ENDING = '.edit.json'

const editNameOf = (baseName: string) => `${baseName}${EDIT_ENDING}`

const filmTemplateNameOf = (name: string) => `${name}.film-template.json`

const FREED_LOCKED = 'This montage was freed from this machine — nothing of it is here to change.'

export { EDIT_ENDING, editNameOf, filmNameOf, filmTemplateNameOf, FREED_LOCKED }
