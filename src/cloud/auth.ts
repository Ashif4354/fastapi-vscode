import * as vscode from "vscode"
import { trackCloudSignIn } from "../utils/telemetry"
import { ApiService } from "./api"

const AUTH_POLL_INTERVAL_MS = 3000
const CLIENT_ID = "fastapi-vscode"

interface AuthConfig {
  access_token: string
}

/** Check if a JWT token is expired. Exported for testing. */
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return true

    const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString())

    if (decoded.exp === undefined) return false
    return Date.now() >= decoded.exp * 1000
  } catch {
    return true
  }
}

export class AuthService {
  private authUri: vscode.Uri | null = null
  private lastAuthState = false
  private pollingInterval?: ReturnType<typeof setInterval>

  private _onAuthStateChanged = new vscode.EventEmitter<boolean>()
  readonly onAuthStateChanged = this._onAuthStateChanged.event

  startWatching() {
    // Poll for auth changes since we can't use fs.watch in browser
    // and VS Code's file watcher doesn't work for files outside workspace
    this.pollingInterval = setInterval(
      () => this.checkAndFireAuthState(),
      AUTH_POLL_INTERVAL_MS,
    )
  }

  private async checkAndFireAuthState() {
    const loggedIn = await this.isLoggedIn()
    if (loggedIn !== this.lastAuthState) {
      // Track sign in when transitioning from logged out to logged in
      if (loggedIn && !this.lastAuthState) {
        trackCloudSignIn()
      }
      this.lastAuthState = loggedIn
      this._onAuthStateChanged.fire(loggedIn)
    }
  }

  private getAuthUri(): vscode.Uri | null {
    if (this.authUri) return this.authUri

    // In browser (vscode.dev), we can't access local filesystem auth
    if (vscode.env.uiKind === vscode.UIKind.Web) {
      return null
    }

    // Get home directory from environment
    const home = process.env.HOME || process.env.USERPROFILE
    if (!home) return null

    const platform = process.platform
    let authPath: string

    if (platform === "darwin") {
      authPath = `${home}/Library/Application Support/fastapi-cli/auth.json`
    } else if (platform === "win32") {
      const appData = process.env.APPDATA || `${home}/AppData/Roaming`
      authPath = `${appData}/fastapi-cli/auth.json`
    } else {
      const xdgData = process.env.XDG_DATA_HOME || `${home}/.local/share`
      authPath = `${xdgData}/fastapi-cli/auth.json`
    }

    this.authUri = vscode.Uri.file(authPath)
    return this.authUri
  }

  async getToken(): Promise<string | null> {
    const authUri = this.getAuthUri()
    if (!authUri) return null

    try {
      const content = await vscode.workspace.fs.readFile(authUri)
      const authConfig: AuthConfig = JSON.parse(
        Buffer.from(content).toString("utf8"),
      )
      return authConfig.access_token
    } catch {
      return null
    }
  }

  async isLoggedIn(): Promise<boolean> {
    const token = await this.getToken()
    if (!token) {
      return false
    }
    return !isTokenExpired(token)
  }

  async refresh(): Promise<boolean> {
    const loggedIn = await this.isLoggedIn()
    this._onAuthStateChanged.fire(loggedIn)
    return loggedIn
  }

  async signIn(): Promise<boolean> {
    //Check if already logged in via CLI
    if (await this.isLoggedIn()) {
      this._onAuthStateChanged.fire(true)
      return true
    }

    try {
      const deviceCodeResponse = await ApiService.requestDeviceCode(CLIENT_ID)
      // Show instructions to user
      const verificationUri =
        deviceCodeResponse.verification_uri_complete ||
        `${deviceCodeResponse.verification_uri}?user_code=${deviceCodeResponse.user_code}`
      vscode.env.openExternal(vscode.Uri.parse(verificationUri))

      const intervalMs = (deviceCodeResponse.interval ?? 5) * 1000

      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Signing in to FastAPI Cloud...",
          cancellable: true,
        },
        async (_progress, cancellationToken) => {
          const abortController = new AbortController()
          cancellationToken.onCancellationRequested(() =>
            abortController.abort(),
          )

          const token = await ApiService.pollDeviceToken(
            CLIENT_ID,
            deviceCodeResponse.device_code,
            intervalMs,
            abortController.signal,
          )

          await this.saveToken(token)
          return true
        },
      )
    } catch (error) {
      vscode.window.showErrorMessage(
        `Sign-in failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return false
    }
  }

  async saveToken(token: string): Promise<void> {
    const authUri = this.getAuthUri()
    if (!authUri) return

    // Create parent directory
    const parentUri = vscode.Uri.joinPath(authUri, "..")
    await vscode.workspace.fs.createDirectory(parentUri)
    await vscode.workspace.fs.writeFile(
      authUri,
      Buffer.from(JSON.stringify({ access_token: token }), "utf8"),
    )
    this._onAuthStateChanged.fire(true)
  }

  /** Sign out - delete shared auth file */
  async signOut(): Promise<void> {
    const authUri = this.getAuthUri()
    if (!authUri) return

    try {
      await vscode.workspace.fs.delete(authUri)
    } catch {
      /* file doesn't exist */
    }
    this._onAuthStateChanged.fire(false)
  }

  dispose() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
    }
    this._onAuthStateChanged.dispose()
  }
}
