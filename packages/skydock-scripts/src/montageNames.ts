const filmNameOf = (baseName: string) => `${baseName}.mp4`

const editNameOf = (baseName: string) => `${baseName}.edit.json`

const filmTemplateNameOf = (name: string) => `${name}.film-template.json`

const EDIT_LOCKED =
  'This montage has a kdenlive project — change it in kdenlive, or start the edit again.'

const FREED_LOCKED = 'This montage was freed from this machine — nothing of it is here to change.'

export { EDIT_LOCKED, editNameOf, filmNameOf, filmTemplateNameOf, FREED_LOCKED }
