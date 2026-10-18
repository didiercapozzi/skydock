const filmNameOf = (baseName: string) => `${baseName}.mp4`

const editNameOf = (baseName: string) => `${baseName}.edit.json`

const EDIT_LOCKED = 'This montage has an edit — change it in its editor.'

export { EDIT_LOCKED, editNameOf, filmNameOf }
