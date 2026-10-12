const openedPath = (href: string) => decodeURIComponent(decodeURIComponent(href.split('launchParam=')[1] ?? ''))

export { openedPath }
