import * as vscode from "vscode"
import { trackCloudSignIn } from "../utils/telemetry"

interface AuthConfig {
  access_token: string
}

export class AuthService {
  public static instance: AuthService
  private authUri: vscode.Uri | null = null
  private lastAuthState = false
  private pollingInterval?: ReturnType<typeof setInterval>

  private _onAuthStateChanged = new vscode.EventEmitter<boolean>()
  readonly onAuthStateChanged = this._onAuthStateChanged.event

  private constructor() {}

  startWatching() {
    // Poll for auth changes since we can't use fs.watch in browser
    // and VS Code's file watcher doesn't work for files outside workspace
    this.pollingInterval = setInterval(() => this.checkAndFireAuthState(), 3000)
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

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService()
    }
    return AuthService.instance
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
    return !this.isTokenExpired(token)
  }

  private isTokenExpired(token: string): boolean {
    try {
      const parts = token.split(".")
      if (parts.length !== 3) return true

      let payload = parts[1]
      // Add padding if needed (JWT uses base64url encoding without padding)
      const padding = payload.length % 4
      if (padding) {
        payload += "=".repeat(4 - padding)
      }
      // Convert base64url to base64
      payload = payload.replace(/-/g, "+").replace(/_/g, "/")

      const decoded = JSON.parse(Buffer.from(payload, "base64").toString())
      if (decoded.exp === undefined) return false
      return Date.now() >= decoded.exp * 1000
    } catch {
      return true
    }
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

    // Else, do OAuth flow here (TODO)
    // - Open browser
    // - Register URI handler for vscode://fastapi.fastapi-cloud/callback
    // - Exchange code for token
    // - Call saveToken() to write to shared location

    return false
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
