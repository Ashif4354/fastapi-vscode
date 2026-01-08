import * as fs from "node:fs"

export function resolveImport(
  importInfo: { modulePath: string; isRelative: boolean; relativeDots: number },
  currentFilePath: string,
  projectRoot: string,
): string | null {
  let resolvedPath = ""

  if (importInfo.isRelative) {
    const currentDir = currentFilePath
      .split("/")
      .slice(0, -1 * importInfo.relativeDots)
      .join("/")
    resolvedPath = `${currentDir}/${importInfo.modulePath.replace(/\./g, "/")}`
  } else {
    resolvedPath = `${projectRoot}/${importInfo.modulePath.replace(/\./g, "/")}`
  }

  // check for .py file
  if (fs.existsSync(`${resolvedPath}.py`)) {
    return `${resolvedPath}.py`
  }

  // check for __init__.py in directory
  if (fs.existsSync(`${resolvedPath}/__init__.py`)) {
    return `${resolvedPath}/__init__.py`
  }

  return null
}

export function resolveNamedImport(
  importInfo: {
    modulePath: string
    names: string[]
    isRelative: boolean
    relativeDots: number
  },
  currentFilePath: string,
  projectRoot: string,
): string | null {
  const basePath = resolveImport(importInfo, currentFilePath, projectRoot)
  if (!basePath) {
    return null
  }

  for (const name of importInfo.names) {
    const namedPath =
      basePath.split("/").slice(0, -1).join("/") +
      "/" +
      name.replace(/\./g, "/")

    // check for .py file
    if (fs.existsSync(`${namedPath}.py`)) {
      return `${namedPath}.py`
    }

    // check for __init__.py in directory
    if (fs.existsSync(`${namedPath}/__init__.py`)) {
      return `${namedPath}/__init__.py`
    }
  }

  return null
}
