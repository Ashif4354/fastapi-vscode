import * as assert from "node:assert"
import * as path from "node:path"
import { analyzeFile, analyzeTree } from "../core/analyzer"
import { Parser } from "../core/parser"

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

suite("analyzer", () => {
  let parser: Parser
  let fixturesPath: string

  // Helper to parse code and assert tree is not null
  const parse = (code: string) => {
    const tree = parser.parse(code)
    if (!tree) {
      throw new Error("Failed to parse code")
    }
    return tree
  }

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(getWasmPaths())
    fixturesPath = getFixturesPath()
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  suite("analyzeTree", () => {
    test("extracts routes from decorated functions", () => {
      const code = `
from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def list_items():
    pass

@router.post("/")
def create_item():
    pass
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.routes.length, 2)
      assert.strictEqual(result.routes[0].method, "get")
      assert.strictEqual(result.routes[0].path, "/")
      assert.strictEqual(result.routes[1].method, "post")
    })

    test("extracts routers from assignments", () => {
      const code = `
from fastapi import FastAPI, APIRouter

app = FastAPI()
router = APIRouter(prefix="/api")
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.routers.length, 2)
      assert.strictEqual(result.routers[0].variableName, "app")
      assert.strictEqual(result.routers[0].type, "FastAPI")
      assert.strictEqual(result.routers[1].variableName, "router")
      assert.strictEqual(result.routers[1].type, "APIRouter")
      assert.strictEqual(result.routers[1].prefix, "/api")
    })

    test("extracts include_router calls", () => {
      const code = `
app.include_router(users.router, prefix="/users")
app.include_router(items.router, prefix="/items")
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.includeRouters.length, 2)
      assert.strictEqual(result.includeRouters[0].router, "users.router")
      assert.strictEqual(result.includeRouters[0].prefix, "/users")
      assert.strictEqual(result.includeRouters[1].router, "items.router")
      assert.strictEqual(result.includeRouters[1].prefix, "/items")
    })

    test("extracts imports", () => {
      const code = `
from fastapi import FastAPI
from .routes import users, items
import os
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.imports.length, 3)

      const fastapiImport = result.imports.find(
        (i) => i.modulePath === "fastapi",
      )
      assert.ok(fastapiImport)
      assert.deepStrictEqual(fastapiImport.names, ["FastAPI"])

      const routesImport = result.imports.find((i) => i.modulePath === "routes")
      assert.ok(routesImport)
      assert.strictEqual(routesImport.isRelative, true)
    })

    test("sets filePath correctly", () => {
      const code = "x = 1"
      const tree = parse(code)
      const result = analyzeTree(tree, "/custom/path.py")

      assert.strictEqual(result.filePath, "/custom/path.py")
    })
  })

  suite("analyzeFile", () => {
    test("analyzes main.py fixture", () => {
      const mainPyPath = path.join(fixturesPath, "main.py")
      const result = analyzeFile(mainPyPath, parser)

      assert.ok(result)
      assert.strictEqual(result.filePath, mainPyPath)

      // Should find FastAPI app
      const fastApiRouter = result.routers.find((r) => r.type === "FastAPI")
      assert.ok(fastApiRouter)
      assert.strictEqual(fastApiRouter.variableName, "app")

      // Should find include_router call
      assert.ok(result.includeRouters.length > 0)

      // Should find health check route
      const healthRoute = result.routes.find((r) => r.path === "/health")
      assert.ok(healthRoute)
      assert.strictEqual(healthRoute.method, "get")
    })

    test("analyzes users.py fixture", () => {
      const usersPath = path.join(
        fixturesPath,
        "app",
        "api",
        "routes",
        "users.py",
      )
      const result = analyzeFile(usersPath, parser)

      assert.ok(result)

      // Should find APIRouter
      const apiRouter = result.routers.find((r) => r.type === "APIRouter")
      assert.ok(apiRouter)

      // Should find multiple routes
      assert.ok(result.routes.length >= 5)

      // Check specific routes
      const methods = result.routes.map((r) => r.method)
      assert.ok(methods.includes("get"))
      assert.ok(methods.includes("post"))
      assert.ok(methods.includes("put"))
      assert.ok(methods.includes("delete"))
    })

    test("returns null for non-existent file", () => {
      const result = analyzeFile("/nonexistent/file.py", parser)
      assert.strictEqual(result, null)
    })
  })
})
