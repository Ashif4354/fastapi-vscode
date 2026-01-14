import * as assert from "node:assert"
import * as path from "node:path"
import { Parser } from "../core/parser"
import { findProjectRoot } from "../core/pathUtils"
import { buildRouterGraph } from "../core/routerResolver"
import { routerNodeToAppDefinition } from "../core/transformer"
import type {
  AppDefinition,
  RouteDefinition,
  RouterDefinition,
} from "../core/types"

const getWasmPaths = () => {
  const wasmDir = path.join(__dirname, "..", "wasm")
  return {
    core: path.join(wasmDir, "web-tree-sitter.wasm"),
    python: path.join(wasmDir, "tree-sitter-python.wasm"),
  }
}

const getFixturesPath = () => {
  return path.join(__dirname, "..", "..", "src", "test", "fixtures")
}

/** Collects all routes from an AppDefinition (direct routes + routes from all routers) */
function collectAllRoutes(appDef: AppDefinition): RouteDefinition[] {
  const routes: RouteDefinition[] = [...appDef.routes]

  function collectFromRouter(router: RouterDefinition): void {
    routes.push(...router.routes)
    for (const child of router.children) {
      collectFromRouter(child)
    }
  }

  for (const router of appDef.routers) {
    collectFromRouter(router)
  }

  return routes
}

suite("Project Layouts", () => {
  let parser: Parser
  let testAppsPath: string

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(getWasmPaths())
    testAppsPath = getFixturesPath()
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  test("standard: discovers routes from package layout", () => {
    const entryPath = path.join(testAppsPath, "standard", "app", "main.py")
    const workspaceRoot = path.join(testAppsPath, "standard")
    const projectRoot = findProjectRoot(entryPath, workspaceRoot)

    const graph = buildRouterGraph(entryPath, parser, projectRoot)
    assert.ok(graph, "Should find FastAPI app")

    const appDef = routerNodeToAppDefinition(graph, workspaceRoot)
    const allRoutes = collectAllRoutes(appDef)

    // Should have: GET /, GET /health, GET /users/, GET /users/{user_id}, POST /users/, GET /items/, GET /items/{item_id}
    assert.strictEqual(
      allRoutes.length,
      7,
      `Expected 7 routes, got ${allRoutes.length}`,
    )

    const paths = allRoutes.map((r) => `${r.method} ${r.path}`)
    assert.ok(
      paths.some((p) => p === "GET /"),
      "Should have GET /",
    )
    assert.ok(
      paths.some((p) => p === "GET /users/"),
      "Should have GET /users/",
    )
    assert.ok(
      paths.some((p) => p === "GET /users/{user_id}"),
      "Should have GET /users/{user_id}",
    )
    assert.ok(
      paths.some((p) => p === "GET /items/"),
      "Should have GET /items/",
    )
  })

  test("flat: discovers routes from flat layout", () => {
    const entryPath = path.join(testAppsPath, "flat", "main.py")
    const workspaceRoot = path.join(testAppsPath, "flat")
    const projectRoot = findProjectRoot(entryPath, workspaceRoot)

    const graph = buildRouterGraph(entryPath, parser, projectRoot)
    assert.ok(graph, "Should find FastAPI app")

    const appDef = routerNodeToAppDefinition(graph, workspaceRoot)
    const allRoutes = collectAllRoutes(appDef)

    // Should have: GET /, GET /api/users, GET /api/items
    assert.strictEqual(
      allRoutes.length,
      3,
      `Expected 3 routes, got ${allRoutes.length}`,
    )

    const paths = allRoutes.map((r) => `${r.method} ${r.path}`)
    assert.ok(
      paths.some((p) => p === "GET /"),
      "Should have GET /",
    )
    assert.ok(
      paths.some((p) => p === "GET /api/users"),
      "Should have GET /api/users",
    )
    assert.ok(
      paths.some((p) => p === "GET /api/items"),
      "Should have GET /api/items",
    )
  })

  test("namespace: discovers routes from namespace package (no __init__.py)", () => {
    const entryPath = path.join(testAppsPath, "namespace", "app", "main.py")
    const workspaceRoot = path.join(testAppsPath, "namespace")
    const projectRoot = findProjectRoot(entryPath, workspaceRoot)

    const graph = buildRouterGraph(entryPath, parser, projectRoot)
    assert.ok(graph, "Should find FastAPI app")

    const appDef = routerNodeToAppDefinition(graph, workspaceRoot)
    const allRoutes = collectAllRoutes(appDef)

    // Should have: GET /, GET /users/, GET /users/{user_id}, GET /items/
    assert.strictEqual(
      allRoutes.length,
      4,
      `Expected 4 routes, got ${allRoutes.length}`,
    )

    const paths = allRoutes.map((r) => `${r.method} ${r.path}`)
    assert.ok(
      paths.some((p) => p === "GET /"),
      "Should have GET /",
    )
    assert.ok(
      paths.some((p) => p === "GET /users/"),
      "Should have GET /users/",
    )
    assert.ok(
      paths.some((p) => p === "GET /items/"),
      "Should have GET /items/",
    )
  })

  test("reexport: discovers routes from __init__.py re-exports", () => {
    const entryPath = path.join(testAppsPath, "reexport", "app", "main.py")
    const workspaceRoot = path.join(testAppsPath, "reexport")
    const projectRoot = findProjectRoot(entryPath, workspaceRoot)

    const graph = buildRouterGraph(entryPath, parser, projectRoot)
    assert.ok(graph, "Should find FastAPI app")

    const appDef = routerNodeToAppDefinition(graph, workspaceRoot)
    const allRoutes = collectAllRoutes(appDef)

    // Should have: GET /, GET /integrations/github, GET /integrations/slack, POST /integrations/webhook
    assert.strictEqual(
      allRoutes.length,
      4,
      `Expected 4 routes, got ${allRoutes.length}`,
    )

    const paths = allRoutes.map((r) => `${r.method} ${r.path}`)
    assert.ok(
      paths.some((p) => p === "GET /"),
      "Should have GET /",
    )
    assert.ok(
      paths.some((p) => p === "GET /integrations/github"),
      "Should have GET /integrations/github",
    )
    assert.ok(
      paths.some((p) => p === "GET /integrations/slack"),
      "Should have GET /integrations/slack",
    )
    assert.ok(
      paths.some((p) => p === "POST /integrations/webhook"),
      "Should have POST /integrations/webhook",
    )
  })
})
