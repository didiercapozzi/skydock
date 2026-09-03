import { useMemo } from 'react'
import type { z } from 'zod'
import type { BaseRegister, PageOf, SafeActionArgs } from '../routing/create-safe-routing-engine'
import { useForm } from './context'

type SafeFetcher<TRegister extends BaseRegister> = {
  readonly data?: unknown
  readonly state: 'idle' | 'submitting' | 'loading'
  readonly submit: <TPage extends PageOf<TRegister>>(args: SafeActionArgs<TRegister, TPage>) => void
}

type UseSafeFormOptions<TSchema extends z.ZodObject<z.ZodRawShape>, TPage extends string> = {
  readonly schema: TSchema
  readonly defaultValues: z.input<TSchema>
  readonly page: TPage
  readonly onSuccess?: (data: z.output<TSchema>) => void
}

const createUseSafeForm =
  <TRegister extends BaseRegister>(useSafeFetcher: () => SafeFetcher<TRegister>) =>
  <TSchema extends z.ZodObject<z.ZodRawShape>, TPage extends PageOf<TRegister>>({
    schema,
    defaultValues,
    page,
    onSuccess
  }: UseSafeFormOptions<TSchema, TPage>) => {
    const rawFetcher = useSafeFetcher()

    const fetcher = useMemo(
      () => ({
        ...rawFetcher,
        submit: (data: unknown) =>
          rawFetcher.submit({
            url: page,
            actionArgs: data
          } as never)
      }),
      [rawFetcher, page]
    )

    return useForm({
      schema,
      defaultValues,
      fetcher,
      onSuccess
    })
  }

export { createUseSafeForm }
export type { SafeFetcher, UseSafeFormOptions }
