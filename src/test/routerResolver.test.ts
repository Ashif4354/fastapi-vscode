import * as assert from "node:assert"
import * as path from "node:path"
import { Parser } from "../core/parser"
import { buildRouterGraph } from "../core/routerResolver"

// Tests run from dist/test/*.test.js, so we go up to dist, then into wasm
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

suite("routerResolver", () => {
  let parser: Parser
  let fixturesPath: string

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(getWasmPaths())
    fixturesPath = getFixturesPath()
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  suite("buildRouterGraph", () => {
    test("builds graph from main.py entry point", () => {
      const standardPath = path.join(fixturesPath, "standard")
      const mainPyPath = path.join(standardPath, "app", "main.py")
      const result = buildRouterGraph(mainPyPath, parser, standardPath)

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.variableName, "app")
      assert.strictEqual(result.filePath, mainPyPath)
    })

    test("includes direct routes on app", () => {
      const standardPath = path.join(fixturesPath, "standard")
      const mainPyPath = path.join(standardPath, "app", "main.py")
      const result = buildRouterGraph(mainPyPath, parser, standardPath)

      assert.ok(result)
      // app/main.py has @app.get("/health")
      const healthRoute = result.routes.find((r) => r.path === "/health")
      assert.ok(healthRoute)
      assert.strictEqual(healthRoute.method, "get")
      assert.strictEqual(healthRoute.function, "health")
    })

    test("follows include_router to child routers", () => {
      const standardPath = path.join(fixturesPath, "standard")
      const mainPyPath = path.join(standardPath, "app", "main.py")
      const result = buildRouterGraph(mainPyPath, parser, standardPath)

      assert.ok(result)
      // app/main.py includes users and items routers
      assert.ok(
        result.children.length >= 2,
        "Should have at least 2 child routers",
      )
    })

    test("captures prefix from router definition", () => {
      const standardPath = path.join(fixturesPath, "standard")
      const mainPyPath = path.join(standardPath, "app", "main.py")
      const result = buildRouterGraph(mainPyPath, parser, standardPath)

      assert.ok(result)
      // users.router has prefix="/users" in its definition
      const usersChild = result.children.find(
        (c) => c.router.prefix === "/users",
      )
      assert.ok(usersChild, "Should have child with /users prefix")
    })

    test("returns null for non-existent file", () => {
      const result = buildRouterGraph(
        "/nonexistent/file.py",
        parser,
        fixturesPath,
      )
      assert.strictEqual(result, null)
    })

    test("returns null for file without FastAPI/APIRouter", () => {
      const standardPath = path.join(fixturesPath, "standard")
      const initPath = path.join(standardPath, "app", "__init__.py")
      const result = buildRouterGraph(initPath, parser, standardPath)

      // __init__.py has no FastAPI or APIRouter
      assert.strictEqual(result, null)
    })

    test("builds graph from APIRouter file", () => {
      const standardPath = path.join(fixturesPath, "standard")
      const usersPath = path.join(standardPath, "app", "routes", "users.py")
      const result = buildRouterGraph(usersPath, parser, standardPath)

      assert.ok(result)
      assert.strictEqual(result.type, "APIRouter")
      assert.strictEqual(result.variableName, "router")

      // Should have routes (users.py has 3 routes: list, get, create)
      assert.ok(result.routes.length >= 3)
    })

    test("includes line numbers for routes", () => {
      const standardPath = path.join(fixturesPath, "standard")
      const usersPath = path.join(standardPath, "app", "routes", "users.py")
      const result = buildRouterGraph(usersPath, parser, standardPath)

      assert.ok(result)
      for (const route of result.routes) {
        assert.ok(route.line > 0, "Route should have valid line number")
        assert.ok(route.column >= 0, "Route should have valid column number")
      }
    })

    test("includes router location info", () => {
      const standardPath = path.join(fixturesPath, "standard")
      const usersPath = path.join(standardPath, "app", "routes", "users.py")
      const result = buildRouterGraph(usersPath, parser, standardPath)

      assert.ok(result)
      assert.strictEqual(result.filePath, usersPath)
      assert.ok(result.line > 0)
      assert.ok(result.column >= 0)
    })

    test("follows __init__.py re-exports to actual router file", () => {
      // Use reexport fixture which has integrations/__init__.py re-exporting from router.py
      const reexportPath = path.join(fixturesPath, "reexport")
      const initPath = path.join(
        reexportPath,
        "app",
        "integrations",
        "__init__.py",
      )
      const result = buildRouterGraph(initPath, parser, reexportPath)

      assert.ok(result, "Should find router via re-export")
      assert.strictEqual(result.type, "APIRouter")
      assert.strictEqual(result.variableName, "router")

      // Should point to router.py, not __init__.py
      assert.ok(
        result.filePath.endsWith("router.py"),
        `Expected filePath to end with router.py, got ${result.filePath}`,
      )

      // Should have the routes defined in router.py (3 routes: github, slack, webhook)
      assert.ok(result.routes.length >= 3, "Should have routes from router.py")
      const githubRoute = result.routes.find((r) => r.path === "/github")
      assert.ok(githubRoute, "Should find github route")
    })

    test("includes router when following include_router chain", () => {
      const standardPath = path.join(fixturesPath, "standard")
      const mainPyPath = path.join(standardPath, "app", "main.py")
      const result = buildRouterGraph(mainPyPath, parser, standardPath)

      assert.ok(result)

      // app/main.py includes users.router and items.router
      assert.ok(result.children.length >= 2, "Should have child routers")

      // Find the users router child
      const usersChild = result.children.find(
        (c) => c.router.prefix === "/users",
      )
      assert.ok(usersChild, "Should have users router child")

      // users router should have routes
      assert.ok(
        usersChild.router.routes.length >= 3,
        "users router should have routes",
      )
    })
  })
})
