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
