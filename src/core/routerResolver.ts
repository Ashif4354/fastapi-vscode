import fs from "node:fs"
import path from "node:path"
import { analyzeFile } from "./analyzer"
import type { RouterType } from "./extractors"
import { resolveImport, resolveNamedImport } from "./importResolver"
import type { Parser } from "./parser"

export interface RouterNode {
  filePath: string
  variableName: string
  type: RouterType
  prefix: string
  line: number
  column: number
  routes: {
    method: string
    path: string
    function: string
    line: number
    column: number
  }[]
  children: { router: RouterNode; prefix: string }[]
}

export function buildRouterGraph(
  entryFile: string,
  parser: Parser,
  projectRoot: string,
): RouterNode | null {
  // Resolve the full path of the entry file if necessary
  let resolvedEntryFile = entryFile
  if (!fs.existsSync(resolvedEntryFile)) {
    resolvedEntryFile = path.join(projectRoot, entryFile)
    if (!fs.existsSync(resolvedEntryFile)) {
      console.error(`Entry file does not exist: ${resolvedEntryFile}`)
      return null
    }
  }
  // Analyze the entry file
  const analysis = analyzeFile(resolvedEntryFile, parser)
  if (!analysis) {
    return null
  }

  // Find FastAPI instantiation
  const appRouter = analysis.routers.find(
    (r) => r.type === "FastAPI" || r.type === "APIRouter",
  )
  if (!appRouter) {
    return null
  }

  // Find all routers included in the app
  const rootRouter: RouterNode = {
    filePath: resolvedEntryFile,
    variableName: appRouter.variableName,
    type: appRouter.type,
    prefix: appRouter.prefix,
    line: appRouter.line,
    column: appRouter.column,
    routes: analysis.routes.map((r) => ({
      method: r.method,
      path: r.path,
      function: r.function,
      line: r.line,
      column: r.column,
    })),
    children: [],
  }

  // Process include_router calls to find child routers
  for (const include of analysis.includeRouters) {
    const parts = include.router.split(".")
    const moduleName = parts[0]

    const matchingImport = analysis.imports.find((imp) =>
      imp.names.includes(moduleName),
    )

    if (matchingImport) {
      let importedFilePath = resolveNamedImport(
        {
          modulePath: matchingImport.modulePath,
          names: [moduleName],
          isRelative: matchingImport.isRelative,
          relativeDots: matchingImport.relativeDots,
        },
        resolvedEntryFile,
        projectRoot,
      )

      if (!importedFilePath) {
        importedFilePath = resolveImport(
          {
            modulePath: matchingImport.modulePath,
            isRelative: matchingImport.isRelative,
            relativeDots: matchingImport.relativeDots,
          },
          resolvedEntryFile,
          projectRoot,
        )
      }

      if (importedFilePath) {
        const childRouterNode = buildRouterGraph(
          importedFilePath,
          parser,
          projectRoot,
        )
        if (childRouterNode) {
          rootRouter.children.push({
            router: childRouterNode,
            prefix: include.prefix,
          })
        }
      }
    }
  }

  return rootRouter
}
