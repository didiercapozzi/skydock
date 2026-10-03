/* Where a folder on the storage is in the storage's own web interface: File Station, opened on it — or,
   given a file's path, on the folder it is in with that file chosen. The
   address is the one the board was connected with, since it is the same server; nothing is sent to it
   from here — it is a link, followed by whoever presses it, who signs in there as they always do. The
   path goes in twice encoded, the way File Station reads its launch parameter. Null for an address
   that cannot be read. */
const dsmFolderUrl = (host: string, folder: string) => {
  try {
    const base = new URL(/^https?:\/\//.test(host) ? host : `https://${host}`)
    const param = encodeURIComponent(`openfile=${encodeURIComponent(folder)}`)
    return `${base.origin}/index.cgi?launchApp=SYNO.SDS.App.FileStation3.Instance&launchParam=${param}`
  } catch {
    return null
  }
}

export { dsmFolderUrl }
