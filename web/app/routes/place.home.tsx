import { Navigate, redirect } from 'react-router'
import { placeHref } from '../helpers/places'

const loader = () => redirect(placeHref({ kind: 'sort' }))

const Home = () => (
  <Navigate
    to={placeHref({ kind: 'sort' })}
    replace
  />
)

export { loader }
export default Home
