import * as assert from "node:assert"
import sinon from "sinon"
import { ApiService } from "../../cloud/api"
import { AuthService, isTokenExpired } from "../../cloud/auth"

function createJwtToken(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" }
  const headerEncoded = Buffer.from(JSON.stringify(header)).toString(
    "base64url",
  )
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  )
  const signature = Buffer.from("signature").toString("base64url")
  return `${headerEncoded}.${payloadEncoded}.${signature}`
}

suite("cloud/auth", () => {
  suite("isTokenExpired", () => {
    test("valid token", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600
      const token = createJwtToken({ exp: futureExp })
      assert.ok(!isTokenExpired(token))
    })

    test("expired token", () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600
      const token = createJwtToken({ exp: pastExp })
      assert.ok(isTokenExpired(token))
    })

    test("no exp claim", () => {
      const token = createJwtToken({})
      assert.ok(!isTokenExpired(token))
    })

    test("malformed tokens", () => {
      assert.ok(isTokenExpired("not.a.valid.jwt.token"))
      assert.ok(isTokenExpired("only.two"))
      assert.ok(isTokenExpired("invalid"))
      assert.ok(isTokenExpired(""))
      assert.ok(isTokenExpired("..."))
    })

    test("invalid base64", () => {
      assert.ok(isTokenExpired("header.!!!invalid!!!.signature"))
    })

    test("exact expiration", () => {
      const currentTime = Math.floor(Date.now() / 1000)
      const token = createJwtToken({ exp: currentTime })
      assert.ok(isTokenExpired(token))
    })

    test("one second before expiration", () => {
      const currentTime = Math.floor(Date.now() / 1000)
      const token = createJwtToken({ exp: currentTime + 1 })
      assert.ok(!isTokenExpired(token))
    })
  })

  suite("getToken", () => {
    teardown(() => sinon.restore())

    test("returns null when auth file does not exist", async () => {
      const auth = new AuthService()

      const result = await auth.getToken()
      assert.strictEqual(result, null)

      auth.dispose()
    })
  })

  suite("instance methods", () => {
    let auth: AuthService

    setup(() => {
      auth = new AuthService()
    })

    teardown(() => {
      auth.dispose()
      sinon.restore()
    })

    suite("isLoggedIn", () => {
      test("returns true when token is valid", async () => {
        const futureExp = Math.floor(Date.now() / 1000) + 3600
        const token = createJwtToken({ exp: futureExp })

        sinon.stub(auth, "getToken").resolves(token)

        const result = await auth.isLoggedIn()
        assert.ok(result)
      })

      test("returns false when token is expired", async () => {
        const pastExp = Math.floor(Date.now() / 1000) - 3600
        const token = createJwtToken({ exp: pastExp })

        sinon.stub(auth, "getToken").resolves(token)

        const result = await auth.isLoggedIn()
        assert.ok(!result)
      })

      test("returns false when no token", async () => {
        sinon.stub(auth, "getToken").resolves(null)

        const result = await auth.isLoggedIn()
        assert.ok(!result)
      })
    })

    suite("refresh", () => {
      test("fires auth state changed and returns login status", async () => {
        sinon.stub(auth, "isLoggedIn").resolves(true)

        const spy = sinon.spy()
        auth.onAuthStateChanged(spy)

        const result = await auth.refresh()

        assert.ok(result)
        assert.ok(spy.calledOnceWith(true))
      })

      test("fires false when not logged in", async () => {
        sinon.stub(auth, "isLoggedIn").resolves(false)

        const spy = sinon.spy()
        auth.onAuthStateChanged(spy)

        const result = await auth.refresh()

        assert.ok(!result)
        assert.ok(spy.calledOnceWith(false))
      })
    })

    suite("signOut", () => {
      test("fires auth state changed with false", async () => {
        const spy = sinon.spy()
        auth.onAuthStateChanged(spy)

        await auth.signOut()

        assert.ok(spy.calledOnceWith(false))
      })
    })

    suite("signIn flow", () => {
      test("saves token on successful device flow", async () => {
        sinon.stub(auth, "isLoggedIn").resolves(false)

        sinon.stub(ApiService, "requestDeviceCode").resolves({
          device_code: "test_device_code",
          user_code: "TEST-CODE",
          verification_uri: "https://example.com/verify",
          expires_in: 900,
          interval: 5,
        })

        sinon.stub(ApiService, "pollDeviceToken").resolves("new_test_token")

        const saveTokenStub = sinon.stub(auth, "saveToken").resolves()

        const result = await auth.signIn()

        assert.ok(result)
        assert.strictEqual(saveTokenStub.firstCall.args[0], "new_test_token")
      })

      test("returns false when polling fails", async () => {
        sinon.stub(auth, "isLoggedIn").resolves(false)
        sinon.stub(auth, "saveToken").resolves()

        sinon.stub(ApiService, "requestDeviceCode").resolves({
          device_code: "test_device_code",
          user_code: "TEST-CODE",
          verification_uri: "https://example.com/verify",
          expires_in: 900,
          interval: 5,
        })

        sinon
          .stub(ApiService, "pollDeviceToken")
          .rejects(new Error("Device code has expired"))

        const result = await auth.signIn()

        assert.ok(!result)
      })

      test("returns true and fires event if already logged in", async () => {
        sinon.stub(auth, "isLoggedIn").resolves(true)

        const saveTokenSpy = sinon.spy(auth, "saveToken")
        const authStateChangedSpy = sinon.spy()
        auth.onAuthStateChanged(authStateChangedSpy)

        const result = await auth.signIn()

        assert.ok(result)
        assert.ok(saveTokenSpy.notCalled)
        assert.ok(authStateChangedSpy.calledOnceWith(true))
      })
    })
  })

  suite("dispose", () => {
    teardown(() => sinon.restore())

    test("clears polling interval", () => {
      const auth = new AuthService()

      sinon.stub(auth, "isLoggedIn").resolves(true)
      auth.startWatching()

      auth.dispose()
    })

    test("dispose without startWatching does not throw", () => {
      const auth = new AuthService()
      auth.dispose()
    })
  })
})
