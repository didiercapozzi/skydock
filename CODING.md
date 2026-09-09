# CODING — SkyDock Coding Rules

> Coding conventions for SkyDock. Extracted from RULES.md §11.

- React Router 8 Framework Mode, SSR, `app/routes.ts` + `app/routes/` modules, `import from ./+types/...`.
- Arrow functions only, `type` over `interface`, never `any`, all exports at end, inferred returns.
- Never explicitly type function return types — let TypeScript infer them.
- Data schemas use Zod for runtime validation; types are inferred via `z.infer<typeof schema>` — never defined separately.
- Write the cleanest, most reusable, most readable, most reduced code possible — no verbosity, no redundancy.
- Scripts use TypeScript with `tsx` for direct execution.
- `npm run check` (`typecheck` + `format:check` + `lint`) must pass before commit.
- "export" keywords must be at the end of the file and not before a const/variable, function or types
- we use camel case format for const/variables, except UPPER_SNAKE_CASE is allowed for module-level constants
- use "const" instead of "let" or "var" every time you can
- Scripts package: `@skydock/scripts` — all shared logic lives here
- Never duplicate: if logic is needed in multiple places, extract to `@skydock/scripts`
- Never use "import" inside of the code, all import words must be listed at the top of the files
- E2E and browser tests always use the most visually realistic user simulation to avoid false positives: `userEvent` from `vitest/browser` (`page`, `userEvent.dragAndDrop`/`userEvent.click`/`userEvent.fill`) or `locator.dropTo`/`dragTo` with Playwright provider. Never synthesize `new DragEvent`/`new MouseEvent` + `dispatchEvent` — they bypass `preventDefault` checks, `DataTransfer` sharing, and viewport hit-testing. For drag & drop, use `userEvent.dragAndDrop(source, target, { targetPosition })` (or `source.dropTo(target)`) with `targetPosition: {x,y}` for above/below precision; pre-scroll the drop target into view first so no auto-scroll breaks the gesture mid-drag. Assert DOM order via `expect.poll`, persistence via stubbed `action`, and visual state via `page.screenshot`.
- When app code changes, tests are the source of truth: adapt the code to the tests first. Tests change only when explicitly requested or when RULES.md behavior changes
- Never call an endpoint using a string URL; always use the typesafe `routingEngine` (`routingEngine.href({ url })`, `useSafeFetcher`, `useSafeSubmit`) with routes from the generated `Register`
- Server actions always use `createValidatedFormAction` with a Zod schema; field errors via `errors.addFieldError`, global errors via `errors.addGlobalError`, and return `errors.toResponse(422)` when `errors.hasErrors()`
- Shared routing and form logic lives in `@skydock/ui` (`routingEngine`, safe hooks, validated actions); never reimplement endpoint calls per route
- All forms must use `@skydock/ui/forms` (`useForm`, `Form`, `FormField`, `GlobalErrors`, `createValidatedFormAction`) with a Zod schema — see `web/app/components/connection-dialog.tsx` as canonical example; never use `useState` + manual `<input>`/`<form>` handling for form state or validation
- Never use React memoization (`useCallback`, `useMemo`, `memo`) — React Compiler handles memoization automatically; write plain functions and values
- Never commit without explicit user approval
- Never bypass lint like: eslint-disable-next-line react/set-state-in-effect or any other
- Always use Zod `safeParse` for runtime validation of API, loader, and fetcher data; never use dirty manual checks like `as unknown`, `as {…}`, `typeof data === 'object'`, `'key' in data`, `Array.isArray((data as…).field)`, or `if (data && 'prop' in data)`. Define a `z.object`/`z.array` schema and branch on `parsed.success` (`parsed.data` / `parsed.error`).
