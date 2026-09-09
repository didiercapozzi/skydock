import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

type GeneratorArgs = {
  appDir: string
  outputFile: string
  registerName: string
  contractImport: string
  contractType: string
  pagePrefix?: string
}

type LeafRoute = {
  id: string
  page: string
  routeFile: string
}

const readTypeBlock = (source: string, typeName: string) => {
  const declarationStart = source.indexOf(`type ${typeName} = {`)

  if (declarationStart < 0) {
    throw new Error(`Could not find React Router type "${typeName}".`)
  }

  const blockStart = source.indexOf('{', declarationStart)
  let depth = 0

  for (let index = blockStart; index < source.length; index += 1) {
    const character = source[index]

    if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
    }

    if (depth === 0) {
      return source.slice(blockStart + 1, index)
    }
  }

  throw new Error(`Could not parse React Router type "${typeName}".`)
}

const parseLeafRoutes = ({ source, pagePrefix }: { source: string; pagePrefix?: string }) => {
  const routeFilesBlock = readTypeBlock(source, 'RouteFiles')
  const routeList: LeafRoute[] = []
  const routePattern = /"([^"]+)":\s*\{\s*id:\s*"([^"]+)";\s*page:\s*"([^"]+)";\s*\};/g

  for (const match of routeFilesBlock.matchAll(routePattern)) {
    const routeFile = match[1]
    const id = match[2]
    const page = match[3]

    if (routeFile && id && page && (pagePrefix === undefined || page.startsWith(pagePrefix))) {
      routeList.push({
        id,
        page,
        routeFile
      })
    }
  }

  return routeList
}

const createParamsType = (page: string) => {
  const parameterList = [...page.matchAll(/:([^/?]+)(\?)?/g)]

  if (parameterList.length === 0) {
    return '{}'
  }

  return `{
${parameterList
  .map((match) => `        '${match[1]}'${match[2] === '?' ? '?' : ''}: string`)
  .join('\n')}
      }`
}

const loadProgram = (appDir: string) => {
  const configPath = ts.findConfigFile(appDir, ts.sys.fileExists, 'tsconfig.json')

  if (!configPath) {
    throw new Error(`Could not find tsconfig.json in ${appDir}.`)
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)

  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  )

  return ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options
  })
}

const getExportSymbol = ({
  checker,
  sourceFile,
  exportName
}: {
  checker: ts.TypeChecker
  sourceFile: ts.SourceFile
  exportName: string
}) => {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile)

  if (!moduleSymbol) {
    return undefined
  }

  return checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === exportName)
}

const printPortableType = ({
  checker,
  sourceFile,
  type
}: {
  checker: ts.TypeChecker
  sourceFile: ts.SourceFile
  type: ts.Type
}) => {
  const printed = checker.typeToString(
    type,
    sourceFile,
    ts.TypeFormatFlags.NoTruncation |
      ts.TypeFormatFlags.InTypeAlias |
      ts.TypeFormatFlags.UseStructuralFallback |
      ts.TypeFormatFlags.WriteArrayAsGenericType
  )

  // z.object({}) normally becomes `{}`, which accepts arbitrary object keys.
  // Record<string, never> preserves the intended strict empty payload.
  return printed === '{}' ? 'Record<string, never>' : printed
}

const getSchemaInputType = ({
  checker,
  sourceFile,
  exportName
}: {
  checker: ts.TypeChecker
  sourceFile: ts.SourceFile
  exportName: string
}) => {
  const exportSymbol = getExportSymbol({
    checker,
    sourceFile,
    exportName
  })

  if (!exportSymbol) {
    return 'never'
  }

  const schemaType = checker.getTypeOfSymbolAtLocation(exportSymbol, sourceFile)
  const inputProperty = schemaType.getProperty('_input')

  if (!inputProperty) {
    return 'never'
  }

  const inputType = checker.getTypeOfSymbolAtLocation(inputProperty, sourceFile)

  return printPortableType({
    checker,
    sourceFile,
    type: inputType
  })
}

const generatePortableRouteContract = async ({
  appDir,
  outputFile,
  registerName,
  contractImport,
  contractType,
  pagePrefix
}: GeneratorArgs) => {
  const resolvedAppDir = path.resolve(appDir)
  const routesSource = await readFile(
    path.join(resolvedAppDir, '.react-router/types/+routes.ts'),
    'utf8'
  )
  const routeList = parseLeafRoutes({
    source: routesSource,
    pagePrefix
  })
  const program = loadProgram(resolvedAppDir)
  const checker = program.getTypeChecker()

  const pageList = routeList.map(({ id, page, routeFile }) => {
    const sourceFile = program.getSourceFile(path.resolve(resolvedAppDir, 'app', routeFile))

    if (!sourceFile) {
      throw new Error(`Could not load route module "${routeFile}".`)
    }

    const searchParamsArgs = getSchemaInputType({
      checker,
      sourceFile,
      exportName: 'searchParamsArgs'
    })
    const actionArgs = getSchemaInputType({
      checker,
      sourceFile,
      exportName: 'actionArgs'
    })

    return `    '${page}': {
      params: ${createParamsType(page)}
      searchParamsArgs: ${searchParamsArgs}
      actionArgs: ${actionArgs}
      loaderResult: ResultFor<'${id}', 'loaderResult'>
      actionResult: ResultFor<'${id}', 'actionResult'>
    }`
  })

  const output = `/*
 * Generated from React Router's .react-router/types/+routes.ts.
 * Do not edit manually.
 *
 * Paths and path parameters come from React Router.
 * searchParamsArgs and actionArgs come from the actual route exports.
 * HTTP result DTOs come from the explicit shared API contract.
 */

import type { ${contractType} } from '${contractImport}'

type ResultFor<
  TRouteId extends string,
  TKey extends 'loaderResult' | 'actionResult'
> = TRouteId extends keyof ${contractType}
  ? TKey extends keyof ${contractType}[TRouteId]
    ? ${contractType}[TRouteId][TKey]
    : never
  : never

type ${registerName} = {
  pages: {
${pageList.join('\n')}
  }
}

export type { ${registerName} }
`

  const resolvedOutputFile = path.resolve(outputFile)

  await mkdir(path.dirname(resolvedOutputFile), {
    recursive: true
  })
  await writeFile(resolvedOutputFile, output, 'utf8')
}

const getArgument = (argumentList: string[], name: string) => {
  const index = argumentList.indexOf(name)
  return index < 0 ? undefined : argumentList[index + 1]
}

const main = async () => {
  const argumentList = process.argv.slice(2)
  const appDir = getArgument(argumentList, '--app-dir')
  const outputFile = getArgument(argumentList, '--output-file')
  const registerName = getArgument(argumentList, '--register-name')
  const contractImport = getArgument(argumentList, '--contract-import')
  const contractType = getArgument(argumentList, '--contract-type')
  const pagePrefix = getArgument(argumentList, '--page-prefix')

  if (!appDir || !outputFile || !registerName || !contractImport || !contractType) {
    throw new Error(
      'Usage: generate-portable-route-contract ' +
        '--app-dir <dir> ' +
        '--output-file <file> ' +
        '--register-name <name> ' +
        '--contract-import <module> ' +
        '--contract-type <type> ' +
        '[--page-prefix <prefix>]'
    )
  }

  await generatePortableRouteContract({
    appDir,
    outputFile,
    registerName,
    contractImport,
    contractType,
    pagePrefix
  })
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}

export { generatePortableRouteContract }
export type { GeneratorArgs }
