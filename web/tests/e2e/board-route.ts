import Board from '../../app/routes/board'
import PreviewedFile from '../../app/routes/place.file'
import Home from '../../app/routes/place.home'
import Place from '../../app/routes/place'

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
