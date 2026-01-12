import { existsSync } from "node:fs"
import { dirname } from "node:path"
import { analyzeFile } from "./analyzer"
import type { ImportInfo } from "./internal"
import type { Parser } from "./parser"

/**
 * Resolves a module path to its Python file.
 * Checks for direct .py file first, then package __init__.py
 * (matching Python's import resolution order).
 */
function resolvePythonModule(basePath: string): string | null {
  if (existsSync(`${basePath}.py`)) {
    return `${basePath}.py`
  }
  if (existsSync(`${basePath}/__init__.py`)) {
    return `${basePath}/__init__.py`
  }
  return null
}

/**
 * Finds an import that provides a given exported name
 * Used for resolving re-exports in __init__.py files
 **/
function findImportByExportedName(
  imports: ImportInfo[],
  name: string,
): ImportInfo | null {
  // Each import may provide multiple named imports
  // e.g. from module import A as B, C
  for (const imp of imports) {
    for (const namedImport of imp.namedImports) {
      const providedName = namedImport.alias ?? namedImport.name
      if (providedName === name) {
        return imp
      }
    }
  }
  return null
}

/**
 * Base resolution of a module import to its file path.
 * Handles both relative and absolute imports.
 */
export function resolveImport(
  importInfo: Pick<ImportInfo, "modulePath" | "isRelative" | "relativeDots">,
  currentFilePath: string,
  projectRoot: string,
): string | null {
  let resolvedPath: string

  if (importInfo.isRelative) {
    // For relative imports, go up 'relativeDots' directories from current file
    let currentDir = dirname(currentFilePath)
    for (let i = 1; i < importInfo.relativeDots; i++) {
      currentDir = dirname(currentDir)
    }
    resolvedPath = importInfo.modulePath
      ? `${currentDir}/${importInfo.modulePath.replace(/\./g, "/")}`
      : currentDir
    // Absolute import
  } else {
    resolvedPath = `${projectRoot}/${importInfo.modulePath.replace(/\./g, "/")}`
  }

  return resolvePythonModule(resolvedPath)
}

/**
 * Resolves a named import to its file path.
 * For example, from .routes import users
 * will try to resolve to routes/users.py
 */
export function resolveNamedImport(
  importInfo: Pick<
    ImportInfo,
    "modulePath" | "names" | "isRelative" | "relativeDots"
  >,
  currentFilePath: string,
  projectRoot: string,
  parser?: Parser,
): string | null {
  const basePath = resolveImport(importInfo, currentFilePath, projectRoot)
  if (!basePath) {
    return null
  }

  const baseDir = dirname(basePath)

  for (const name of importInfo.names) {
    // Try direct file: from .routes import users -> routes/users.py
    const namedPath = `${baseDir}/${name.replace(/\./g, "/")}`
    const resolved = resolvePythonModule(namedPath)
    if (resolved) {
      return resolved
    }

    // Try re-exports: from .routes import users where routes/__init__.py re-exports users
    if (basePath.endsWith("__init__.py") && parser) {
      const analysis = analyzeFile(basePath, parser)
      const imp = analysis && findImportByExportedName(analysis.imports, name)
      if (imp) {
        const reExportResolved = resolveImport(imp, basePath, projectRoot)
        if (reExportResolved) {
          return reExportResolved
        }
      }
    }
  }

  // Fall back to base module resolution
  return basePath
}

/**
 * When an __init__.py has no router definitions but re-exports a router,
 * this function finds the actual file containing the router.
 *
 * For example, if integrations/__init__.py contains:
 *   from .router import router as router
 * This will return the path to integrations/router.py
 */
export function resolveRouterFromInit(
  initFilePath: string,
  projectRoot: string,
  parser: Parser,
): string | null {
  if (!initFilePath.endsWith("__init__.py")) {
    return null
  }

  const analysis = analyzeFile(initFilePath, parser)
  if (!analysis) {
    return null
  }

  // If this file has routers defined, no need to follow re-exports
  if (analysis.routers.length > 0) {
    return null
  }

  const imp = findImportByExportedName(analysis.imports, "router")
  if (imp) {
    return resolveImport(imp, initFilePath, projectRoot)
  }

  return null
}
