import { href as reactRouterHref } from 'react-router'
import type z from 'zod'
import { deepDateSchema, parseIsoDatesDeep } from '../utils/common'

type PageDefinition = {
  params: Record<string, string | undefined>
  searchParamsArgs?: unknown
  actionArgs?: unknown
  loaderResult?: unknown
  actionResult?: unknown
}

type BaseRegister = {
  pages: object
}

type NativeRegister = BaseRegister & {
  routeFiles: object
  routeModules: object
}

type PageOf<TRegister extends BaseRegister> = Extract<keyof TRegister['pages'], string>

type PageDefinitionOf<
  TRegister extends BaseRegister,
  TPage extends PageOf<TRegister>
> = TRegister['pages'][TPage]

type ParamsOf<TRegister extends BaseRegister, TPage extends PageOf<TRegister>> =
  PageDefinitionOf<TRegister, TPage> extends {
    params: infer TParams
  }
    ? TParams
    : never

/*
 * React Router gives every layout a union of all descendant pages, while the
 * leaf route has one exact page literal. Extract therefore keeps only the leaf
 * route file for the requested page.
 */
type RouteIdForPage<TRegister extends NativeRegister, TPage extends PageOf<TRegister>> = {
  [TFile in keyof TRegister['routeFiles']]: TRegister['routeFiles'][TFile] extends {
    id: infer TRouteId
    page: infer TRoutePage
  }
    ? TPage extends TRoutePage
      ? Extract<TRouteId, keyof TRegister['routeModules']>
      : never
    : never
}[keyof TRegister['routeFiles']]

type RouteModuleForPage<
  TRegister extends NativeRegister,
  TPage extends PageOf<TRegister>
> = TRegister['routeModules'][RouteIdForPage<TRegister, TPage>]

type SchemaInputFromModule<TModule, TKey extends PropertyKey> = TModule extends unknown
  ? TKey extends keyof TModule
    ? TModule[TKey] extends z.ZodType
      ? z.input<TModule[TKey]>
      : never
    : never
  : never

type FunctionResultFromModule<TModule, TKey extends PropertyKey> = TModule extends unknown
  ? TKey extends keyof TModule
    ? TModule[TKey] extends (...args: never[]) => infer TResult
      ? Awaited<TResult>
      : never
    : never
  : never

type ExplicitValue<
  TRegister extends BaseRegister,
  TPage extends PageOf<TRegister>,
  TKey extends PropertyKey
> = TKey extends keyof PageDefinitionOf<TRegister, TPage>
  ? PageDefinitionOf<TRegister, TPage>[TKey]
  : never

type SearchParamsOf<
  TRegister extends BaseRegister,
  TPage extends PageOf<TRegister>
> = TRegister extends NativeRegister
  ? SchemaInputFromModule<RouteModuleForPage<TRegister, TPage>, 'searchParamsArgs'>
  : ExplicitValue<TRegister, TPage, 'searchParamsArgs'>

type ActionArgsOf<
  TRegister extends BaseRegister,
  TPage extends PageOf<TRegister>
> = TRegister extends NativeRegister
  ? SchemaInputFromModule<RouteModuleForPage<TRegister, TPage>, 'actionArgs'>
  : ExplicitValue<TRegister, TPage, 'actionArgs'>

type LoaderResultOf<
  TRegister extends BaseRegister,
  TPage extends PageOf<TRegister>
> = TRegister extends NativeRegister
  ? FunctionResultFromModule<RouteModuleForPage<TRegister, TPage>, 'loader'>
  : ExplicitValue<TRegister, TPage, 'loaderResult'>

type ActionResultOf<
  TRegister extends BaseRegister,
  TPage extends PageOf<TRegister>
> = TRegister extends NativeRegister
  ? FunctionResultFromModule<RouteModuleForPage<TRegister, TPage>, 'action'>
  : ExplicitValue<TRegister, TPage, 'actionResult'>

type IsNever<TValue> = [TValue] extends [never] ? true : false

type ParamsPart<TRegister extends BaseRegister, TPage extends PageOf<TRegister>> = keyof ParamsOf<
  TRegister,
  TPage
> extends never
  ? {
      params?: never
    }
  : {
      params: ParamsOf<TRegister, TPage>
    }

type SearchParamsPart<TRegister extends BaseRegister, TPage extends PageOf<TRegister>> =
  IsNever<SearchParamsOf<TRegister, TPage>> extends true
    ? {
        searchParamsArgs?: never
      }
    : {} extends SearchParamsOf<TRegister, TPage>
      ? {
          searchParamsArgs?: SearchParamsOf<TRegister, TPage>
        }
      : {
          searchParamsArgs: SearchParamsOf<TRegister, TPage>
        }

type SafeHrefArgs<TRegister extends BaseRegister, TPage extends PageOf<TRegister>> = {
  url: TPage
} & ParamsPart<TRegister, TPage> &
  SearchParamsPart<TRegister, TPage>

type SafeActionArgs<TRegister extends BaseRegister, TPage extends PageOf<TRegister>> =
  IsNever<ActionArgsOf<TRegister, TPage>> extends true
    ? never
    : SafeHrefArgs<TRegister, TPage> & {
        actionArgs: ActionArgsOf<TRegister, TPage>
      }

type CreateSafeRoutingEngineOptions = {
  baseUrl?: string
  headers?: HeadersInit
}

const nativeHref = reactRouterHref as unknown as (
  path: string,
  params?: Record<string, string | undefined>
) => string

const appendSearchParams = ({
  pathname,
  searchParamsArgs
}: {
  pathname: string
  searchParamsArgs: unknown
}) => {
  if (searchParamsArgs === undefined) {
    return pathname
  }

  const url = new URL(pathname, 'http://safe-routing.local')
  url.searchParams.set('q', JSON.stringify(searchParamsArgs))

  return `${url.pathname}${url.search}${url.hash}`
}

const createSafeRoutingEngine = <const TRegister extends BaseRegister>(
  defaults: CreateSafeRoutingEngineOptions = {}
) => {
  const href = <const TPage extends PageOf<TRegister>>(args: SafeHrefArgs<TRegister, TPage>) => {
    const pathname =
      'params' in args && args.params !== undefined
        ? nativeHref(args.url, args.params as Record<string, string | undefined>)
        : nativeHref(args.url)

    return appendSearchParams({
      pathname,
      searchParamsArgs: 'searchParamsArgs' in args ? args.searchParamsArgs : undefined
    })
  }

  const resolveUrl = (pathname: string) => {
    return defaults.baseUrl ? new URL(pathname, defaults.baseUrl).toString() : pathname
  }

  const readResponse = async <TResult>(response: Response) => {
    const responseText = await response.text()

    if (!response.ok) {
      throw new Error(responseText || response.statusText)
    }

    if (!responseText) {
      return undefined as TResult
    }

    return parseIsoDatesDeep(JSON.parse(responseText)) as TResult
  }

  const loader = async <const TPage extends PageOf<TRegister>>(
    args: SafeHrefArgs<TRegister, TPage> & {
      headers?: HeadersInit
    }
  ) => {
    const response = await fetch(resolveUrl(href(args)), {
      method: 'GET',
      headers: {
        ...defaults.headers,
        ...args.headers
      }
    })

    return readResponse<LoaderResultOf<TRegister, TPage>>(response)
  }

  const action = async <const TPage extends PageOf<TRegister>>(
    args: SafeActionArgs<TRegister, TPage> & {
      headers?: HeadersInit
      method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    }
  ) => {
    const response = await fetch(resolveUrl(href(args)), {
      method: args.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...defaults.headers,
        ...args.headers
      },
      body: JSON.stringify(args.actionArgs)
    })

    return readResponse<ActionResultOf<TRegister, TPage>>(response)
  }

  /*
   * What `action` cannot carry: files. It sends JSON, and bytes in JSON are a third bigger and held
   * whole at both ends. This hands the request a form as it is — the browser sets the boundary, so
   * no content type is named here — and reads the same answer back, typed the same way.
   */
  const upload = async <const TPage extends PageOf<TRegister>>(
    args: SafeHrefArgs<TRegister, TPage> & {
      body: FormData
      headers?: HeadersInit
      method?: 'POST' | 'PUT' | 'PATCH'
    }
  ) => {
    const response = await fetch(resolveUrl(href(args)), {
      method: args.method ?? 'POST',
      headers: {
        ...defaults.headers,
        ...args.headers
      },
      body: args.body
    })

    /*
     * A refused upload answers 422 with what was wrong with it, the way every other action here
     * refuses, and that is the whole of what the caller wants to show. So the answer is read
     * whether or not it was a yes, and only something that is no answer at all is thrown.
     */
    const answered = await response.text()
    try {
      return parseIsoDatesDeep(JSON.parse(answered)) as ActionResultOf<TRegister, TPage>
    } catch {
      throw new Error(answered || response.statusText)
    }
  }

  const parseSearchParams = <Schema extends z.ZodObject<z.ZodRawShape>>(
    schema: Schema,
    options:
      | {
          request: Request
          url?: never
        }
      | {
          url: string
          request?: never
        }
  ) => {
    const url = new URL(
      options.request ? options.request.url : options.url,
      'http://safe-routing.local'
    )
    const serialized = url.searchParams.get('q')

    if (!serialized) {
      return schema.parse({})
    }

    try {
      return schema.parse(JSON.parse(serialized))
    } catch {
      return schema.parse({})
    }
  }

  const parseFormData = async <Schema extends z.ZodObject<z.ZodRawShape>>({
    request,
    schema,
    data
  }: {
    schema: Schema
  } & (
    | {
        request: Request
        data?: never
      }
    | {
        data: z.infer<Schema>
        request?: never
      }
  )) => {
    const jsonData = request ? await request.clone().json() : data

    return deepDateSchema(schema).parse(jsonData)
  }

  return {
    action,
    href,
    loader,
    parseFormData,
    parseSearchParams,
    upload
  }
}

export { createSafeRoutingEngine }

export type {
  ActionArgsOf,
  ActionResultOf,
  BaseRegister,
  CreateSafeRoutingEngineOptions,
  LoaderResultOf,
  PageDefinition,
  PageOf,
  SafeActionArgs,
  SafeHrefArgs
}
