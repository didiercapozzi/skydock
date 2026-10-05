import { Navigate, redirect } from 'react-router'
import { placeHref } from '../helpers/places'

/* The board's front door. Fresh files is what it opens on, and that folder has an address of its
   own, so the front door hands it over rather than being a second address for the same thing: one
   folder, one address, and the folder in the rail knows it is the one open. The server replaces the
   address before anything is drawn, so the page is never shown under the bare one; where a board is
   drawn without a server in front of it, the page hands it over itself. */
const loader = () => redirect(placeHref({ kind: 'sort' }))

const Home = () => (
  <Navigate
    to={placeHref({ kind: 'sort' })}
    replace
  />
)

export { loader }
export default Home
