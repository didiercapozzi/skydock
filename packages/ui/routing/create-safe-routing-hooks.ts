import { useCallback, useMemo } from 'react'
import { useFetcher, useNavigation, useSearchParams, useSubmit } from 'react-router'
import type z from 'zod'
import type {
  BaseRegister,
  PageOf,
  SafeActionArgs,
  SafeHrefArgs
} from './create-safe-routing-engine'
import { useForm } from '../forms/context'
import type { UseFormOptions } from '../forms/types'

type EngineInstance<TRegister extends BaseRegister> = {
  href: <const TPage extends PageOf<TRegister>>(args: SafeHrefArgs<TRegister, TPage>) => string
}

type FetcherSubmitTarget = Parameters<ReturnType<typeof useFetcher>['submit']>[0]

type FetcherSubmitOptions = Parameters<ReturnType<typeof useFetcher>['submit']>[1]

type SubmitTarget = Parameters<ReturnType<typeof useSubmit>>[0]
type SubmitOptions = Parameters<ReturnType<typeof useSubmit>>[1]

type SetSearchParamsOptions = Parameters<ReturnType<typeof useSearchParams>[1]>[1]

const createSafeRoutingHooks = <const TRegister extends BaseRegister>(
  engine: EngineInstance<TRegister>
) => {
  const useSafeFetcher = () => {
    const fetcher = useFetcher()

    const submit = <const TPage extends PageOf<TRegister>>(
      args: SafeActionArgs<TRegister, TPage>,
      options?: FetcherSubmitOptions
    ) =>
      fetcher.submit(args.actionArgs as FetcherSubmitTarget, {
        method: 'post',
        encType: 'application/json',
        ...options,
        action: engine.href(args)
      })

    const load = <const TPage extends PageOf<TRegister>>(args: SafeHrefArgs<TRegister, TPage>) =>
      fetcher.load(engine.href(args))

    return {
      ...fetcher,
      load,
      submit
    }
  }

  const useSafeSubmit = () => {
    const submit = useSubmit()

    return <const TPage extends PageOf<TRegister>>(
      args: SafeActionArgs<TRegister, TPage>,
      options?: SubmitOptions
    ) =>
      submit(args.actionArgs as SubmitTarget, {
        method: 'post',
        encType: 'application/json',
        ...options,
        action: engine.href(args)
      })
  }

  const useSafeSearchParams = <Schema extends z.ZodObject<z.ZodRawShape>>(schema: Schema) => {
    const [searchParams, setSearchParams] = useSearchParams()
    const navigation = useNavigation()

    const data = useMemo(() => {
      const activeParams =
        navigation.location !== undefined
          ? new URLSearchParams(navigation.location.search)
          : searchParams

      const serialized = activeParams.get('q')

      if (!serialized) {
        return schema.parse({})
      }

      try {
        return schema.parse(JSON.parse(serialized))
      } catch {
        return schema.parse({})
      }
    }, [navigation.location, schema, searchParams])

    const setSafeParams = useCallback(
      (
        newValues:
          | Partial<z.infer<Schema>>
          | ((previous: z.infer<Schema>) => Partial<z.infer<Schema>>),
        options?: SetSearchParamsOptions
      ) => {
        setSearchParams((previousParams) => {
          const nextParams = new URLSearchParams(previousParams)
          const resolvedValues = typeof newValues === 'function' ? newValues(data) : newValues
          const mergedValues = {
            ...data,
            ...resolvedValues
          }
          const cleanValues = Object.fromEntries(
            Object.entries(mergedValues).filter(
              ([, value]) => value !== undefined && value !== null
            )
          )

          if (Object.keys(cleanValues).length === 0) {
            nextParams.delete('q')
          } else {
            nextParams.set('q', JSON.stringify(cleanValues))
          }

          return nextParams
        }, options)
      },
      [data, setSearchParams]
    )

    return {
      isPending: navigation.location !== undefined,
      searchParams: data as z.infer<Schema>,
      setSearchParams: setSafeParams
    }
  }

  const useSafeForm = <
    TSchema extends z.ZodObject<z.ZodRawShape>,
    TPage extends PageOf<TRegister>
  >({
    page: _page,
    ...options
  }: UseFormOptions<TSchema> & {
    readonly page: TPage
  }) => useForm(options)

  return {
    useSafeFetcher,
    useSafeForm,
    useSafeSearchParams,
    useSafeSubmit
  }
}

export { createSafeRoutingHooks }
