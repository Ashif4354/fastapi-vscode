import * as assert from "node:assert"
import { shouldExclude } from "../../cloud/commands/deploy"

suite("cloud/deploy", () => {
  suite("shouldExclude", () => {
    test("excludes expected directories", () => {
      // Spot check a few key patterns
      assert.strictEqual(shouldExclude(".venv/lib/python3.11/site.py"), true)
      assert.strictEqual(
        shouldExclude("__pycache__/module.cpython-311.pyc"),
        true,
      )
      assert.strictEqual(shouldExclude(".git/config"), true)
      assert.strictEqual(shouldExclude(".fastapicloud/cloud.json"), true)
      assert.strictEqual(shouldExclude("node_modules/express/index.js"), true)
    })

    test("excludes .egg-info directories", () => {
      assert.strictEqual(shouldExclude("mypackage.egg-info/PKG-INFO"), true)
    })

    test("excludes .env files", () => {
      assert.strictEqual(shouldExclude(".env"), true)
      assert.strictEqual(shouldExclude(".env.local"), true)
      assert.strictEqual(shouldExclude(".env.production"), true)
    })

    test("excludes .pyc files", () => {
      assert.strictEqual(shouldExclude("module.pyc"), true)
    })

    test("includes regular source files", () => {
      assert.strictEqual(shouldExclude("main.py"), false)
      assert.strictEqual(shouldExclude("src/app.py"), false)
      assert.strictEqual(shouldExclude("requirements.txt"), false)
      assert.strictEqual(shouldExclude("pyproject.toml"), false)
    })
  })
})
