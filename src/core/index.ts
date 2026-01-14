/**
 * Public API for FastAPI endpoint discovery.
 * This module can be used independently of VSCode.
 */

export { analyzeFile, analyzeTree } from "./analyzer"
export type { FileAnalysis } from "./internal"
export { Parser } from "./parser"
export { buildRouterGraph, type RouterNode } from "./routerResolver"
export { routerNodeToAppDefinition } from "./transformer"
export type {
  AppDefinition,
  HTTPMethod,
  RouteDefinition,
  RouteMethod,
  RouterDefinition,
  SourceLocation,
} from "./types"
