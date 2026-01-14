import * as assert from "node:assert"
import { Parser } from "../../core/parser"
import { wasmPaths } from "../testUtils"

suite("parser", () => {
  test("throws error if parse called before init", () => {
    const parser = new Parser()
    assert.throws(() => parser.parse("x = 1"), /not initialized/i)
  })

  test("parses Python code after init", async () => {
    const parser = new Parser()
    await parser.init(wasmPaths)

    const tree = parser.parse("x = 1")
    assert.ok(tree)
    assert.strictEqual(tree.rootNode.type, "module")

    parser.dispose()
  })

  test("double init is safe", async () => {
    const parser = new Parser()
    await parser.init(wasmPaths)
    await parser.init(wasmPaths) // Should not throw

    const tree = parser.parse("y = 2")
    assert.ok(tree)

    parser.dispose()
  })

  test("parses decorated function", async () => {
    const parser = new Parser()
    await parser.init(wasmPaths)

    const code = `
@router.get("/users")
def get_users():
    pass
`
    const tree = parser.parse(code)
    assert.ok(tree)

    const decoratedDef = tree.rootNode.namedChildren.find(
      (n) => n.type === "decorated_definition",
    )
    assert.ok(decoratedDef)

    parser.dispose()
  })

  test("dispose is safe to call multiple times", async () => {
    const parser = new Parser()
    await parser.init(wasmPaths)

    parser.dispose()
    parser.dispose() // Should not throw
  })
})
