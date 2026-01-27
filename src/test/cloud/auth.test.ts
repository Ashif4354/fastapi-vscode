import * as assert from "node:assert"
import { isTokenExpired } from "../../cloud/auth"

function createJwtToken(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" }
  const headerEncoded = Buffer.from(JSON.stringify(header))
    .toString("base64url")
    .replace(/=+$/, "")
  const payloadEncoded = Buffer.from(JSON.stringify(payload))
    .toString("base64url")
    .replace(/=+$/, "")
  const signature = Buffer.from("signature")
    .toString("base64url")
    .replace(/=+$/, "")
  return `${headerEncoded}.${payloadEncoded}.${signature}`
}

suite("cloud/auth", () => {
  suite("isTokenExpired", () => {
    test("valid token", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600
      const token = createJwtToken({ exp: futureExp, sub: "test_user" })
      assert.strictEqual(isTokenExpired(token), false)
    })

    test("expired token", () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600
      const token = createJwtToken({ exp: pastExp, sub: "test_user" })
      assert.strictEqual(isTokenExpired(token), true)
    })

    test("no exp claim", () => {
      const token = createJwtToken({ sub: "test_user" })
      assert.strictEqual(isTokenExpired(token), false)
    })

    test("malformed tokens", () => {
      assert.strictEqual(isTokenExpired("not.a.valid.jwt.token"), true)
      assert.strictEqual(isTokenExpired("only.two"), true)
      assert.strictEqual(isTokenExpired("invalid"), true)
      assert.strictEqual(isTokenExpired(""), true)
      assert.strictEqual(isTokenExpired("..."), true)
    })

    test("invalid base64", () => {
      assert.strictEqual(isTokenExpired("header.!!!invalid!!!.signature"), true)
    })

    test("exact expiration", () => {
      const currentTime = Math.floor(Date.now() / 1000)
      const token = createJwtToken({ exp: currentTime, sub: "test_user" })
      assert.strictEqual(isTokenExpired(token), true)
    })

    test("one second before expiration", () => {
      const currentTime = Math.floor(Date.now() / 1000)
      const token = createJwtToken({ exp: currentTime + 1, sub: "test_user" })
      assert.strictEqual(isTokenExpired(token), false)
    })
  })
})
