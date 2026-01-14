import * as assert from "node:assert"
import * as path from "node:path"
import { resolveImport, resolveNamedImport } from "../core/importResolver"
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

suite("importResolver", () => {
  let fixturesPath: string
  let parser: Parser

  suiteSetup(async () => {
    fixturesPath = getFixturesPath()
    parser = new Parser()
    await parser.init(getWasmPaths())
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  suite("resolveImport", () => {
    test("resolves relative import to .py file", () => {
      const currentFile = path.join(fixturesPath, "app", "api", "main.py")
      const projectRoot = fixturesPath

      const result = resolveImport(
        { modulePath: "routes.users", isRelative: true, relativeDots: 1 },
        currentFile,
        projectRoot,
      )

      assert.ok(result)
      assert.ok(result.endsWith("users.py"))
    })

    test("resolves relative import to __init__.py", () => {
      const currentFile = path.join(fixturesPath, "app", "api", "main.py")
      const projectRoot = fixturesPath

      const result = resolveImport(
        { modulePath: "routes", isRelative: true, relativeDots: 1 },
        currentFile,
        projectRoot,
      )

      assert.ok(result)
      assert.ok(result.endsWith("__init__.py"))
    })

    test("resolves double-dot relative import", () => {
      // from .. import something (2 dots, no module name)
      // From app/api/routes/users.py, this goes to parent package (app/api)
      const currentFile = path.join(
        fixturesPath,
        "app",
        "api",
        "routes",
        "users.py",
      )
      const projectRoot = fixturesPath

      const result = resolveImport(
        { modulePath: "", isRelative: true, relativeDots: 2 },
        currentFile,
        projectRoot,
      )

      // 2 dots from routes/users.py goes to api/
      assert.ok(result)
      assert.ok(result.endsWith("api/__init__.py"))
    })

    test("resolves absolute import", () => {
      const currentFile = path.join(fixturesPath, "main.py")
      const projectRoot = fixturesPath

      const result = resolveImport(
        {
          modulePath: "app.api.routes.users",
          isRelative: false,
          relativeDots: 0,
        },
        currentFile,
        projectRoot,
      )

      assert.ok(result)
      assert.ok(result.endsWith("users.py"))
    })

    test("returns null for non-existent module", () => {
      const currentFile = path.join(fixturesPath, "main.py")
      const projectRoot = fixturesPath

      const result = resolveImport(
        {
          modulePath: "nonexistent.module",
          isRelative: false,
          relativeDots: 0,
        },
        currentFile,
        projectRoot,
      )

      assert.strictEqual(result, null)
    })
  })

  suite("resolveNamedImport", () => {
    test("resolves named import to .py file", () => {
      const currentFile = path.join(fixturesPath, "app", "api", "main.py")
      const projectRoot = fixturesPath

      const result = resolveNamedImport(
        {
          modulePath: "routes",
          names: ["users"],
          isRelative: true,
          relativeDots: 1,
        },
        currentFile,
        projectRoot,
        parser,
      )

      assert.ok(result)
      assert.ok(result.endsWith("users.py"))
    })

    test("resolves re-exported name from __init__.py", () => {
      const currentFile = path.join(fixturesPath, "app", "api", "main.py")
      const projectRoot = fixturesPath

      // The __init__.py has: from .users import router as users_router
      const result = resolveNamedImport(
        {
          modulePath: "routes",
          names: ["users_router"],
          isRelative: true,
          relativeDots: 1,
        },
        currentFile,
        projectRoot,
        parser,
      )

      assert.ok(result)
      assert.ok(result.endsWith("users.py"))
    })

    test("falls back to base module for non-existent named import", () => {
      const currentFile = path.join(fixturesPath, "app", "api", "main.py")
      const projectRoot = fixturesPath

      const result = resolveNamedImport(
        {
          modulePath: "routes",
          names: ["nonexistent"],
          isRelative: true,
          relativeDots: 1,
        },
        currentFile,
        projectRoot,
        parser,
      )

      // Falls back to the base module when named import not found
      assert.ok(result)
      assert.ok(
        result.endsWith("routes/__init__.py") || result.endsWith("routes.py"),
      )
    })

    test("resolves relative named import from namespace package (no __init__.py)", () => {
      const currentFile = path.join(fixturesPath, "app", "api", "main.py")
      const projectRoot = fixturesPath

      // namespace_routes has no __init__.py, but api_routes.py exists
      const result = resolveNamedImport(
        {
          modulePath: "namespace_routes",
          names: ["api_routes"],
          isRelative: true,
          relativeDots: 1,
        },
        currentFile,
        projectRoot,
        parser,
      )

      assert.ok(result)
      assert.ok(result.endsWith("api_routes.py"))
    })

    test("resolves absolute named import from namespace package (no __init__.py)", () => {
      const currentFile = path.join(fixturesPath, "main.py")
      const projectRoot = fixturesPath

      // app.api.namespace_routes has no __init__.py, but api_routes.py exists
      const result = resolveNamedImport(
        {
          modulePath: "app.api.namespace_routes",
          names: ["api_routes"],
          isRelative: false,
          relativeDots: 0,
        },
        currentFile,
        projectRoot,
        parser,
      )

      assert.ok(result)
      assert.ok(result.endsWith("api_routes.py"))
    })
  })
})
