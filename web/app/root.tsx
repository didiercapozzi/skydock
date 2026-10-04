import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData
} from 'react-router'
import { languageOf } from './helpers/language'
import type { Language } from './helpers/language'
import { speak } from './i18n'

import type { Route } from './+types/root'
import './app.css'

const links: Route.LinksFunction = () => [
  { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
  { rel: 'icon', type: 'image/png', sizes: '256x256', href: '/icon-256.png' },
  { rel: 'icon', type: 'image/png', sizes: '128x128', href: '/icon-128.png' },
  { rel: 'apple-touch-icon', type: 'image/png', sizes: '256x256', href: '/icon-256.png' }
]

const loader = ({ request }: Route.LoaderArgs) => ({ language: languageOf(request) })

const useLanguage = (): Language => {
  const language = useRouteLoaderData<typeof loader>('root')?.language ?? 'en'
  speak(language)
  return language
}

const Layout = ({ children }: { children: React.ReactNode }) => {
  const language = useLanguage()
  return (
    <html
      lang={language}
      suppressHydrationWarning>
      <head>
        <meta charSet='utf-8' />
        <meta
          name='viewport'
          content='width=device-width, initial-scale=1'
        />
        <Meta />
        <Links />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('skydock.theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}"
          }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

const App = () => <Outlet />

const GENERIC_ERROR = 'An unexpected error occurred.'

const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
  const routeError = isRouteErrorResponse(error) ? error : null
  const devError = !routeError && import.meta.env.DEV && error instanceof Error ? error : null
  const message = routeError ? (routeError.status === 404 ? '404' : 'Error') : 'Oops!'
  const details = routeError
    ? routeError.status === 404
      ? 'The requested page could not be found.'
      : routeError.statusText || GENERIC_ERROR
    : (devError?.message ?? GENERIC_ERROR)
  const stack = devError?.stack

  return (
    <main className='pt-16 p-4 container mx-auto'>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className='w-full p-4 overflow-x-auto'>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}

export { ErrorBoundary, Layout, links, loader }
export default App
