import { Navigate } from 'react-router'
import { placeHref } from '../helpers/places'

/* The board's front door. Fresh files is what it opens on, and that folder has an address of its
   own, so the front door hands it over rather than being a second address for the same thing: one
   folder, one address, and the folder in the rail knows it is the one open. The board is already
   drawn and its data already read by the time this happens — nothing is asked for twice. */
const Home = () => (
  <Navigate
    to={placeHref({ kind: 'sort' })}
    replace
  />
)

export default Home
