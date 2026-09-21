import Board from '../../app/routes/board'
import PreviewedFile from '../../app/routes/place.file'
import Home from '../../app/routes/place.home'
import Place from '../../app/routes/place'

/* The board as the browser sees it: one screen, and an address for the folder open in it and the
   file open in that folder (RULES, The board). The board itself is the layout around them, so a
   test that mounts it mounts the addresses too — otherwise clicking a folder in the rail navigates
   to a page that is not there. */
const boardRoute = (loader: () => unknown) => ({
  path: '/',
  Component: Board,
  loader,
  children: [
    { index: true, Component: Home },
    {
      path: ':kind/:name?',
      Component: Place,
      children: [{ path: 'file/:fileId', Component: PreviewedFile }]
    }
  ]
})

export { boardRoute }
