import * as assert from "node:assert"
import * as path from "node:path"
import {
  countSegments,
  findProjectRoot,
  getPathSegments,
  isWithinDirectory,
  stripLeadingDynamicSegments,
} from "../core/pathUtils"

const getFixturesPath = () => {
  return path.join(__dirname, "..", "..", "src", "test", "fixtures", "standard")
}

suite("pathUtils", () => {
  suite("stripLeadingDynamicSegments", () => {
    test("strips single dynamic segment", () => {
      assert.strictEqual(
        stripLeadingDynamicSegments("{settings.API_V1_STR}/users/{id}"),
        "/users/{id}",
      )
    })

    test("strips multiple dynamic segments", () => {
      assert.strictEqual(
        stripLeadingDynamicSegments("{BASE}{VERSION}/api/items"),
        "/api/items",
      )
    })

    test("leaves path parameters unchanged", () => {
      assert.strictEqual(
        stripLeadingDynamicSegments("/users/{id}/posts"),
        "/users/{id}/posts",
      )
    })

    test("returns / for only dynamic segment", () => {
      assert.strictEqual(
        stripLeadingDynamicSegments("{settings.API_V1_STR}"),
        "/",
      )
    })

    test("leaves static paths unchanged", () => {
      assert.strictEqual(
        stripLeadingDynamicSegments("/api/users"),
        "/api/users",
      )
    })

    test("handles empty string", () => {
      assert.strictEqual(stripLeadingDynamicSegments(""), "/")
    })

    test("handles root path", () => {
      assert.strictEqual(stripLeadingDynamicSegments("/"), "/")
    })
  })

  suite("getPathSegments", () => {
    test("gets first N segments", () => {
      assert.strictEqual(
        getPathSegments("/integrations/neon/foo", 2),
        "/integrations/neon",
      )
    })

    test("gets single segment", () => {
      assert.strictEqual(getPathSegments("/users/123/posts", 1), "/users")
    })

    test("returns full path if count exceeds segments", () => {
      assert.strictEqual(getPathSegments("/a/b/c", 5), "/a/b/c")
    })

    test("returns full path if count equals segments", () => {
      assert.strictEqual(getPathSegments("/a/b/c", 3), "/a/b/c")
    })

    test("handles root path", () => {
      assert.strictEqual(getPathSegments("/", 1), "/")
    })

    test("handles zero count", () => {
      assert.strictEqual(getPathSegments("/users/posts", 0), "/")
    })
  })

  suite("countSegments", () => {
    test("counts multiple segments", () => {
      assert.strictEqual(countSegments("/integrations/neon"), 2)
    })

    test("counts single segment", () => {
      assert.strictEqual(countSegments("/users"), 1)
    })

    test("returns 0 for root path", () => {
      assert.strictEqual(countSegments("/"), 0)
    })

    test("handles path without leading slash", () => {
      assert.strictEqual(countSegments("users/posts"), 2)
    })

    test("handles empty string", () => {
      assert.strictEqual(countSegments(""), 0)
    })

    test("ignores trailing slashes", () => {
      assert.strictEqual(countSegments("/users/posts/"), 2)
    })
  })

  suite("isWithinDirectory", () => {
    test("returns true for path inside directory", () => {
      assert.strictEqual(isWithinDirectory("/foo/bar/baz", "/foo/bar"), true)
    })

    test("returns true for path equal to directory", () => {
      assert.strictEqual(isWithinDirectory("/foo/bar", "/foo/bar"), true)
    })

    test("returns false for path outside directory", () => {
      assert.strictEqual(isWithinDirectory("/foo/baz", "/foo/bar"), false)
    })

    test("returns false for sibling with similar prefix", () => {
      // This is the key test - /foo/ba is NOT a parent of /foo/bar
      assert.strictEqual(isWithinDirectory("/foo/bar", "/foo/ba"), false)
    })

    test("returns false for parent directory", () => {
      assert.strictEqual(isWithinDirectory("/foo", "/foo/bar"), false)
    })
  })

  suite("findProjectRoot", () => {
    let fixturesPath: string

    suiteSetup(() => {
      fixturesPath = getFixturesPath()
    })

    test("returns entry dir when no __init__.py present", () => {
      // main.py is at fixtures/standard/main.py, and fixtures/standard has no __init__.py
      const mainPyPath = path.join(fixturesPath, "main.py")
      const result = findProjectRoot(mainPyPath, fixturesPath)

      assert.strictEqual(result, fixturesPath)
    })

    test("walks up to find project root from nested package", () => {
      // users.py is in app/routes/users.py
      // app has __init__.py, routes has __init__.py
      // but fixtures/standard does not, so project root should be fixtures/standard
      const usersPath = path.join(fixturesPath, "app", "routes", "users.py")
      const result = findProjectRoot(usersPath, fixturesPath)

      assert.strictEqual(result, fixturesPath)
    })

    test("returns workspace root when all dirs have __init__.py", () => {
      // If we pretend the workspace root is app, it should return that
      const usersPath = path.join(fixturesPath, "app", "routes", "users.py")
      const appRoot = path.join(fixturesPath, "app")
      const result = findProjectRoot(usersPath, appRoot)

      assert.strictEqual(result, appRoot)
    })
  })
})
