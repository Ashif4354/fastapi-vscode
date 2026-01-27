import * as vscode from "vscode"
import {
  trackCloudAppOpened,
  trackCloudDashboardOpened,
  trackCloudLogsViewed,
  trackCloudProjectUnlinked,
  trackCloudSignOut,
} from "../utils/telemetry"
import { ApiService } from "./api"
import { AuthService } from "./auth"
import { deploy } from "./commands/deploy"
import { ConfigService } from "./config"
import type { App, Team } from "./types"

export class CloudStatusBar {
  private statusBarItem: vscode.StatusBarItem
  private authService: AuthService
  private configService: ConfigService
  private apiService: ApiService
  private currentApp: App | null = null
  private currentTeam: Team | null = null
  private workspaceRoot: vscode.Uri | null = null

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    )

    this.statusBarItem.command = "fastapi-vscode.cloudMenu"

    this.authService = AuthService.getInstance()
    this.configService = ConfigService.getInstance()
    this.apiService = ApiService.getInstance()
  }

  async initialize(workspaceRoot: vscode.Uri) {
    this.workspaceRoot = workspaceRoot
    this.authService.onAuthStateChanged(() => this.refresh())
    this.configService.onConfigStateChanged(() => this.refresh())

    this.authService.startWatching()
    this.configService.startWatching(workspaceRoot)

    await this.refresh()
    this.statusBarItem.show()
  }

  async refresh() {
    const isLoggedIn = await this.authService.isLoggedIn()
    if (!isLoggedIn) {
      this.statusBarItem.text = "$(cloud) Sign in to FastAPI Cloud"
      return
    }

    if (this.workspaceRoot) {
      const config = await this.configService.getConfig(this.workspaceRoot)

      if (!config) {
        this.statusBarItem.text = "$(cloud) Deploy to FastAPI Cloud"
        return
      }

      try {
        this.currentApp = await this.apiService.getApp(config.app_id)
        this.currentTeam = await this.apiService.getTeam(config.team_id)

        if (this.currentApp) {
          this.statusBarItem.text = `$(cloud) ${this.currentApp.slug}`
        }
      } catch {
        this.statusBarItem.text = "$(cloud) Deploy to FastAPI Cloud"
      }
    }
  }

  async showMenu() {
    const isLoggedIn = await this.authService.isLoggedIn()
    if (!isLoggedIn) {
      const result = await vscode.window.showInformationMessage(
        "To sign in, run 'fastapi auth login' in your terminal.",
        "Open Terminal",
      )

      if (result === "Open Terminal") {
        vscode.commands.executeCommand("workbench.action.terminal.new")
      }
      return
    }

    if (!this.currentApp) {
      // No app linked - show link/deploy options
      const items = [
        {
          label: "$(link) Link Existing App",
          description: "Connect to an app on FastAPI Cloud",
          id: "link",
        },
        {
          label: "$(cloud-upload) Create & Deploy",
          description: "Create a new app and deploy",
          id: "deploy",
        },
      ]

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Deploy to FastAPI Cloud",
      })

      if (selected?.id === "link") {
        vscode.commands.executeCommand("fastapi-vscode.linkApp")
      } else if (selected?.id === "deploy") {
        await this.runDeploy()
      }
    } else {
      const dashboardUrl = this.currentTeam
        ? ApiService.getDashboardUrl(
            this.currentTeam.slug,
            this.currentApp.slug,
          )
        : undefined
      const items = [
        {
          label: "$(cloud-upload) Deploy",
          description: "Push latest changes",
          id: "deploy",
        },
        {
          label: "$(globe) Open App",
          description: this.currentApp.url,
          id: "open",
        },
        {
          label: "$(link-external) Dashboard",
          description: dashboardUrl,
          id: "dashboard",
        },
        { label: "$(output) View Logs", id: "logs" },
        { label: "$(ellipsis) More", id: "more" },
      ]

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `${this.currentApp.slug}`,
      })

      if (selected) {
        switch (selected.id) {
          case "deploy":
            await this.runDeploy()
            break
          case "open":
            if (this.currentApp?.url) {
              vscode.env.openExternal(vscode.Uri.parse(this.currentApp.url))
              trackCloudAppOpened()
            }
            break
          case "dashboard":
            if (dashboardUrl) {
              vscode.env.openExternal(vscode.Uri.parse(dashboardUrl))
              trackCloudDashboardOpened()
            }
            break
          case "logs":
            // TODO: Implement logs view in VS Code
            trackCloudLogsViewed()
            vscode.window.showInformationMessage("Logs view coming soon")
            break
          case "more":
            await this.showMoreMenu()
            break
        }
      }
    }
  }

  async runDeploy() {
    if (!this.workspaceRoot) {
      vscode.window.showErrorMessage("No workspace folder open")
      return
    }
    await deploy(this.workspaceRoot, this.statusBarItem)
    await this.refresh()
  }

  private async showMoreMenu() {
    const items = [
      {
        label: "$(trash) Unlink Project",
        description: "Disconnect from FastAPI Cloud app",
        id: "unlink",
      },
      {
        label: "$(sign-out) Sign Out",
        description: "Sign out of FastAPI Cloud",
        id: "signout",
      },
    ]

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "More options",
    })

    switch (selected?.id) {
      case "unlink":
        await this.unlinkProject()
        break
      case "signout":
        await this.signOut()
        break
    }
  }

  async signOut() {
    const confirm = await vscode.window.showWarningMessage(
      "Sign out of FastAPI Cloud?",
      { modal: true },
      "Sign Out",
    )

    if (confirm === "Sign Out") {
      await this.authService.signOut()
      trackCloudSignOut()
      this.currentApp = null
      this.currentTeam = null
      await this.refresh()
    }
  }

  async unlinkProject() {
    if (!this.workspaceRoot || !this.currentApp) {
      return
    }

    const confirm = await vscode.window.showWarningMessage(
      `Unlink "${this.currentApp.slug}" from this project?`,
      { modal: true },
      "Unlink",
    )

    if (confirm === "Unlink") {
      await this.configService.deleteConfig(this.workspaceRoot)
      trackCloudProjectUnlinked()
      this.currentApp = null
      this.currentTeam = null
      await this.refresh()
    }
  }

  dispose() {
    this.statusBarItem.dispose()
  }
}
