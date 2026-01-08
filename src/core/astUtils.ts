import type { Node } from "web-tree-sitter"

export function walkTree(node: Node, depth = 0): void {
  const indent = "  ".repeat(depth)
  console.log(
    `${indent}- ${node.type} [${node.startPosition.row}:${node.startPosition.column} - ${node.endPosition.row}:${node.endPosition.column}]`,
  )
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) {
      walkTree(child, depth + 1)
      console.log(child.type)
    }
  }
}

export function findNodesByType(
  node: Node,
  type: string,
  results: Node[] = [],
): Node[] {
  if (node.type === type) {
    results.push(node)
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) {
      findNodesByType(child, type, results)
    }
  }
  return results
}

export function processDecoratedDefinition(
  node: Node,
): { object: string; method: string; path: string; function: string } | null {
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
  }
}
