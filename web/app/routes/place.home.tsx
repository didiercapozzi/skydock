import { Navigate } from 'react-router'
import { placeHref } from '../helpers/places'

const Home = () => (
  <Navigate
    to={placeHref({ kind: 'sort' })}
    replace
  />
)

export default Home
