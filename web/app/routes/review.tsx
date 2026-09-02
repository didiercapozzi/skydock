import * as React from 'react'
import Home, { loader } from './home'
import type { Manifest } from '../lib/types'

type ReviewProps = {
  loaderData: { manifest: Manifest | null }
}

const Review = (props: ReviewProps) =>
  React.createElement(Home as unknown as never, props as unknown as never)

export default Review
export { loader }
