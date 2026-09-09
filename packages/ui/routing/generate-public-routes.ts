import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

type GeneratorArgs = {
  readonly appDir: string
  readonly outputFile: string
  readonly registerName: string
  readonly publicRoutes: string
}

type LeafRoute = {
  readonly id: string
  readonly page: string
  readonly routeFile: string
}

type PageEntry = LeafRoute & {
  readonly params: string
  readonly searchParamsArgs: string
  readonly actionArgs: string
}

const parseLeafRoutes = ({ source }: { readonly source: string }) => {
  const routePattern =
    /["']([^"']+)["']:\s*\{\s*id:\s*["']([^"']+)["'];?\s*page:\s*["']([^"']+)["'];?\s*\};?/g
  const routeList: LeafRoute[] = []

  for (const [, routeFile, id, page] of source.matchAll(routePattern)) {
    if (routeFile && id && page) {
      routeList.push({ id, page, routeFile })
    }
  }

  return routeList
}

const parsePublicRoutes = ({ source }: { readonly source: string }) => {
  const sourceFile = ts.createSourceFile('public-routes.ts', source, ts.ScriptTarget.Latest, true)
  const pageList: string[] = []
  let found = false

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'publicRoutes') continue
      let initializer = declaration.initializer
      while (
        initializer !== undefined &&
        (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer))
      ) {
        initializer = initializer.expression
      }
      if (initializer === undefined || !ts.isArrayLiteralExpression(initializer)) {
        throw new Error('Could not parse public routes: "publicRoutes" must be an array.')
      }
      found = true
      for (const element of initializer.elements) {
        if (!ts.isStringLiteral(element) && !ts.isNoSubstitutionTemplateLiteral(element)) {
          throw new Error('Could not parse public routes: entries must be string literals.')
        }
        if (!pageList.includes(element.text)) pageList.push(element.text)
      }
    }
  }

  if (!found) {
    throw new Error('Could not parse public routes: no "publicRoutes" array found.')
  }

  return pageList
}

const createParamsType = (page: string) => {
  const entries = [...page.matchAll(/:([^/?]+)(\?)?/g)].map(
    (match) => `        '${match[1]}'${match[2] === '?' ? '?' : ''}: string`
  )

  return entries.length === 0 ? '{}' : `{\n${entries.join('\n')}\n      }`
}

const printFlags =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.InTypeAlias |
  ts.TypeFormatFlags.UseStructuralFallback |
  ts.TypeFormatFlags.WriteArrayAsGenericType

const getSchemaInputType = ({
  checker,
  sourceFile,
  exportName
}: {
  readonly checker: ts.TypeChecker
  readonly sourceFile: ts.SourceFile
  readonly exportName: string
}) => {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
  if (!moduleSymbol) return 'never'
  const exportSymbol = checker
    .getExportsOfModule(moduleSymbol)
    .find((symbol) => symbol.name === exportName)
  if (!exportSymbol) return 'never'
  const inputProperty = checker
    .getTypeOfSymbolAtLocation(exportSymbol, sourceFile)
    .getProperty('_input')
  if (!inputProperty) return 'never'

  return checker.typeToString(
    checker.getTypeOfSymbolAtLocation(inputProperty, sourceFile),
    sourceFile,
    printFlags
  )
}

const loadProgram = (appDir: string) => {
  const configPath = ts.findConfigFile(appDir, ts.sys.fileExists, 'tsconfig.json')
  if (!configPath) throw new Error(`Could not find tsconfig.json in ${appDir}.`)
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath))

  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
}

const renderPage = (entry: PageEntry) =>
  `    '${entry.page}': {
      params: ${entry.params}
      searchParamsArgs: ${entry.searchParamsArgs}
      actionArgs: ${entry.actionArgs}
      loaderResult: unknown
      actionResult: unknown
    }`

const renderRegister = ({
  registerName,
  pages
}: {
  readonly registerName: string
  readonly pages: readonly string[]
}) =>
  `type ${registerName} = {
  pages: {
${pages.join('\n')}
  }
}

export type { ${registerName} }
`

const generatePortableRouteContract = async ({
  appDir,
  outputFile,
  registerName,
  publicRoutes
}: GeneratorArgs) => {
  const resolvedAppDir = path.resolve(appDir)
  const publicSource = await readFile(path.resolve(publicRoutes), 'utf8')
  const routesSource = await readFile(
    path.join(resolvedAppDir, '.react-router/types/+routes.ts'),
    'utf8'
  )
  const routesByPage = new Map<string, LeafRoute>()
  for (const route of parseLeafRoutes({ source: routesSource })) {
    routesByPage.set(route.page, route)
  }
  const routeList = parsePublicRoutes({ source: publicSource }).map((page) => {
    const route = routesByPage.get(page)
    if (!route) {
      throw new Error(`Public route "${page}" was not found in React Router typegen output.`)
    }
    return route
  })
  const program = loadProgram(resolvedAppDir)
  const checker = program.getTypeChecker()

  const pages = routeList.map((route) => {
    const sourceFile = program.getSourceFile(path.resolve(resolvedAppDir, 'app', route.routeFile))
    if (!sourceFile) throw new Error(`Could not load route module "${route.routeFile}".`)

    return renderPage({
      ...route,
      params: createParamsType(route.page),
      searchParamsArgs: getSchemaInputType({ checker, sourceFile, exportName: 'searchParamsArgs' }),
      actionArgs: getSchemaInputType({ checker, sourceFile, exportName: 'actionArgs' })
    })
  })

  const resolvedOutputFile = path.resolve(outputFile)
  await mkdir(path.dirname(resolvedOutputFile), { recursive: true })
  await writeFile(resolvedOutputFile, renderRegister({ registerName, pages }), 'utf8')
}

const parseCliArgs = (argumentList: readonly string[]) => {
  const entries: [string, string][] = []

  for (let index = 0; index < argumentList.length; index += 1) {
    const flag = argumentList[index]
    const value = argumentList[index + 1]
    if (
      flag !== undefined &&
      value !== undefined &&
      flag.startsWith('--') &&
      !value.startsWith('--')
    ) {
      entries.push([flag.slice(2), value])
      index += 1
    }
  }

  return Object.fromEntries(entries)
}

const usage =
  'Usage: generate-public-routes --app-dir <dir> --output-file <file> --register-name <name> --public-routes <file>'

const main = async (argumentList: readonly string[] = process.argv.slice(2)) => {
  const args = parseCliArgs(argumentList)
  const appDir = args['app-dir']
  const outputFile = args['output-file']
  const registerName = args['register-name']
  const publicRoutes = args['public-routes']
  if (!appDir || !outputFile || !registerName || !publicRoutes) {
    throw new Error(usage)
  }

  await generatePortableRouteContract({
    appDir,
    outputFile,
    publicRoutes,
    registerName
  })
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}

export {
  createParamsType,
  generatePortableRouteContract,
  main,
  parseCliArgs,
  parseLeafRoutes,
  parsePublicRoutes,
  renderRegister
}
export type { GeneratorArgs, LeafRoute }
