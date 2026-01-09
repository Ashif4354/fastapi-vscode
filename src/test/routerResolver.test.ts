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

// Fixtures are in src/test/fixtures/python
const getFixturesPath = () => {
  return path.join(__dirname, "..", "..", "src", "test", "fixtures", "python")
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
      const mainPyPath = path.join(fixturesPath, "main.py")
      const result = buildRouterGraph(mainPyPath, parser, fixturesPath)

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.variableName, "app")
      assert.strictEqual(result.filePath, mainPyPath)
    })

    test("includes direct routes on app", () => {
      const mainPyPath = path.join(fixturesPath, "main.py")
      const result = buildRouterGraph(mainPyPath, parser, fixturesPath)

      assert.ok(result)
      // main.py has @app.get("/health")
      const healthRoute = result.routes.find((r) => r.path === "/health")
      assert.ok(healthRoute)
      assert.strictEqual(healthRoute.method, "get")
      assert.strictEqual(healthRoute.function, "health_check")
    })

    test("follows include_router to child routers", () => {
      const mainPyPath = path.join(fixturesPath, "main.py")
      const result = buildRouterGraph(mainPyPath, parser, fixturesPath)

      assert.ok(result)
      // main.py includes api_router from app.api.main
      assert.ok(result.children.length > 0)
    })

    test("captures prefix from include_router", () => {
      const mainPyPath = path.join(fixturesPath, "main.py")
      const result = buildRouterGraph(mainPyPath, parser, fixturesPath)

      assert.ok(result)
      // app.include_router(api_router, prefix="/api/v1")
      const apiChild = result.children.find((c) => c.prefix === "/api/v1")
      assert.ok(apiChild, "Should have child with /api/v1 prefix")
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
      const initPath = path.join(fixturesPath, "app", "__init__.py")
      const result = buildRouterGraph(initPath, parser, fixturesPath)

      // __init__.py has no FastAPI or APIRouter
      assert.strictEqual(result, null)
    })

    test("builds graph from APIRouter file", () => {
      const usersPath = path.join(
        fixturesPath,
        "app",
        "api",
        "routes",
        "users.py",
      )
      const result = buildRouterGraph(usersPath, parser, fixturesPath)

      assert.ok(result)
      assert.strictEqual(result.type, "APIRouter")
      assert.strictEqual(result.variableName, "router")

      // Should have routes
      assert.ok(result.routes.length >= 5)
    })

    test("includes line numbers for routes", () => {
      const usersPath = path.join(
        fixturesPath,
        "app",
        "api",
        "routes",
        "users.py",
      )
      const result = buildRouterGraph(usersPath, parser, fixturesPath)

      assert.ok(result)
      for (const route of result.routes) {
        assert.ok(route.line > 0, "Route should have valid line number")
        assert.ok(route.column >= 0, "Route should have valid column number")
      }
    })

    test("includes router location info", () => {
      const usersPath = path.join(
        fixturesPath,
        "app",
        "api",
        "routes",
        "users.py",
      )
      const result = buildRouterGraph(usersPath, parser, fixturesPath)

      assert.ok(result)
      assert.strictEqual(result.filePath, usersPath)
      assert.ok(result.line > 0)
      assert.ok(result.column >= 0)
    })
  })
})
