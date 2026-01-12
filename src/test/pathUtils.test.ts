import * as assert from "node:assert"
import {
  countSegments,
  getPathSegments,
  stripLeadingDynamicSegments,
} from "../core/pathUtils"

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
})
