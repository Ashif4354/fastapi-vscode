import type {
  AppDefinition,
  RouteDefinition,
  RouteMethod,
  RouterDefinition,
} from "../types/endpoint"
import type { RouterNode } from "./routerResolver"

function normalizeMethod(method: string): RouteMethod {
  const upper = method.toUpperCase()
  if (
    upper === "GET" ||
    upper === "POST" ||
    upper === "PUT" ||
    upper === "DELETE" ||
    upper === "PATCH" ||
    upper === "OPTIONS" ||
    upper === "HEAD"
  ) {
    return upper
  }
  if (upper === "WEBSOCKET") {
    return "WEBSOCKET"
  }
  return "GET" // fallback
}

function flattenRouterNode(
  node: RouterNode,
  parentPrefix: string,
  routers: RouterDefinition[],
  workspaceFolder: string,
): void {
  const fullPrefix = parentPrefix + node.prefix

  // Convert routes from this node
  const routes: RouteDefinition[] = node.routes.map((r) => ({
    method: normalizeMethod(r.method),
    path: fullPrefix + r.path,
    functionName: r.function,
    location: {
      filePath: node.filePath,
      line: r.line,
      column: r.column,
    },
  }))

  // Add this router (skip the root FastAPI app and routers with no routes)
  if (node.type === "APIRouter" && routes.length > 0) {
    routers.push({
      name: node.variableName,
      prefix: fullPrefix,
      tags: node.tags,
      location: {
        filePath: node.filePath,
        line: node.line,
        column: node.column,
      },
      routes,
    })
  }

  // Recurse into children
  for (const child of node.children) {
    flattenRouterNode(
      child.router,
      fullPrefix + child.prefix,
      routers,
      workspaceFolder,
    )
  }
}

export function routerNodeToAppDefinition(
  rootNode: RouterNode,
  workspaceFolder: string,
): AppDefinition {
  const routers: RouterDefinition[] = []

  // Collect direct routes on the FastAPI app
  const directRoutes: RouteDefinition[] = rootNode.routes.map((r) => ({
    method: normalizeMethod(r.method),
    path: rootNode.prefix + r.path,
    functionName: r.function,
    location: {
      filePath: rootNode.filePath,
      line: r.line,
      column: r.column,
    },
  }))

  // Flatten all child routers
  for (const child of rootNode.children) {
    flattenRouterNode(
      child.router,
      rootNode.prefix + child.prefix,
      routers,
      workspaceFolder,
    )
  }

  return {
    name: rootNode.variableName,
    filePath: rootNode.filePath,
    workspaceFolder,
    routers,
    routes: directRoutes,
  }
}
