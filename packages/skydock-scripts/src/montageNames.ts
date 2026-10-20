const filmNameOf = (baseName: string) => `${baseName}.mp4`

const editNameOf = (baseName: string) => `${baseName}.edit.json`

const filmTemplateNameOf = (name: string) => `${name}.film-template.json`

const FREED_LOCKED = 'This montage was freed from this machine — nothing of it is here to change.'

export { editNameOf, filmNameOf, filmTemplateNameOf, FREED_LOCKED }
