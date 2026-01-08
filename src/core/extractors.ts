// Utility functions to extract information from AST nodes

import type { Node } from "web-tree-sitter"
import { findNodesByType } from "./astUtils"

export interface SourceLocation {
  filePath: string
  line: number
  column: number
}

export function decoratorExtractor(node: Node): {
  object: string
  method: string
  path: string
  function: string
  line: number
  column: number
} | null {
  if (node.type !== "decorated_definition") {
    return null
  }

  const decoratorNode = node.firstNamedChild
  const callNodes = decoratorNode ? findNodesByType(decoratorNode, "call") : []
  const callNode = callNodes.length > 0 ? callNodes[0] : null

  if (!callNode) {
    return null
  }

  const functionNameNode = callNode.childForFieldName("function")
  const argumentsNode = callNode.childForFieldName("arguments")

  if (!functionNameNode || !argumentsNode) {
    return null
  }

  const objectNode = functionNameNode.childForFieldName("object")
  const methodNode = functionNameNode.childForFieldName("attribute")

  if (!objectNode || !methodNode) {
    return null
  }

  const pathArgNode = argumentsNode.namedChildren[0]
  let path = ""
  if (pathArgNode && pathArgNode.type === "string") {
    path = pathArgNode.text.slice(1, -1) // Remove quotes
  }

  const functionDefNode = node.childForFieldName("definition")
  const functionNameDefNode = functionDefNode
    ? functionDefNode.childForFieldName("name")
    : null
  const functionName = functionNameDefNode ? functionNameDefNode.text : ""

  return {
    object: objectNode.text,
    method: methodNode.text,
    path,
    function: functionName,
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
  }
}

export type RouterType = "APIRouter" | "FastAPI" | "Unknown"

export function routerExtractor(node: Node): {
  variableName: string
  type: RouterType
  prefix: string
  tags: string[]
  line: number
  column: number
} | null {
  if (node.type !== "assignment") {
    return null
  }

  const variableNameNode = node.childForFieldName("left")
  const valueNode = node.childForFieldName("right")

  if (!variableNameNode || !valueNode) {
    return null
  }

  const variableName = variableNameNode.text

  let type: RouterType = "Unknown"

  if (valueNode.type === "call") {
    const functionNameNode = valueNode.childForFieldName("function")
    if (functionNameNode && functionNameNode.text === "APIRouter") {
      type = "APIRouter"
    } else if (functionNameNode && functionNameNode.text === "FastAPI") {
      type = "FastAPI"
    }

    let prefix = ""
    const tags: string[] = []
    const argumentsNode = valueNode.childForFieldName("arguments")
    if (argumentsNode) {
      for (const child of argumentsNode.namedChildren) {
        if (child.type !== "keyword_argument") continue
        const argName = child.childForFieldName("name")?.text
        const argValue = child.childForFieldName("value")

        if (argName === "prefix" && argValue?.type === "string") {
          prefix = argValue.text.slice(1, -1) // Remove quotes
        } else if (argName === "tags" && argValue?.type === "list") {
          // Extract tags from list like ["login", "auth"]
          for (const elem of argValue.namedChildren) {
            if (elem.type === "string") {
              tags.push(elem.text.slice(1, -1)) // Remove quotes
            }
          }
        }
      }
    }
    if (type !== "Unknown") {
      return {
        variableName,
        type,
        prefix,
        tags,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
      }
    }
  }

  return null
}

export function importExtractor(node: Node): {
  modulePath: string
  names: string[]
  isRelative: boolean
  relativeDots: number
} | null {
  if (
    node.type !== "import_statement" &&
    node.type !== "import_from_statement"
  ) {
    return null
  }

  let modulePath = ""
  const names: string[] = []
  let isRelative = false
  let relativeDots = 0

  if (node.type === "import_statement") {
    // import_statement has "name" field, not "module_name"
    const nameNodes = findNodesByType(node, "dotted_name")
    for (const nameNode of nameNodes) {
      modulePath = nameNode.text
      const asNames = nameNode.text.split(".")
      names.push(asNames[0])
    }
  } else if (node.type === "import_from_statement") {
    const moduleNode = node.childForFieldName("module_name")
    if (moduleNode) {
      const rawPath = moduleNode.text
      const matches = rawPath.match(/^(\.+)(.*)/)
      if (matches) {
        isRelative = true
        relativeDots = matches[1].length
        modulePath = matches[2]
      } else {
        modulePath = rawPath
      }
    }
  }

  const nameNodes = findNodesByType(node, "dotted_name")
  for (let i = 1; i < nameNodes.length; i++) {
    names.push(nameNodes[i].text)
  }

  return { modulePath, names, isRelative, relativeDots }
}

export function includeRouterExtractor(
  node: Node,
): { object: string; router: string; prefix: string } | null {
  if (node.type !== "call") {
    return null
  }

  const functionNameNode = node.childForFieldName("function")
  if (!functionNameNode || functionNameNode.type !== "attribute") {
    return null
  }

  const objectNode = functionNameNode.childForFieldName("object")
  const methodNode = functionNameNode.childForFieldName("attribute")

  if (!objectNode || !methodNode || methodNode.text !== "include_router") {
    return null
  }

  const argumentsNode = node.childForFieldName("arguments")
  if (!argumentsNode) {
    return null
  }

  const routerArg = argumentsNode.namedChildren[0]
  const router = routerArg ? routerArg.text : ""

  let prefix = ""
  for (const argNode of argumentsNode.namedChildren) {
    if (argNode.type === "keyword_argument") {
      const nameNode = argNode.childForFieldName("name")
      const valueNode = argNode.childForFieldName("value")
      if (nameNode?.text === "prefix" && valueNode?.type === "string") {
        prefix = valueNode.text.slice(1, -1) // Remove quotes
      }
    }
  }

  return {
    object: objectNode.text,
    router,
    prefix,
  }
}
