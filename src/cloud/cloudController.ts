import * as vscode from "vscode"
import {
  trackCloudAppOpened,
  trackCloudDashboardOpened,
  trackCloudLogsViewed,
  trackCloudProjectLinked,
  trackCloudProjectUnlinked,
  trackCloudSignOut,
} from "../utils/telemetry"
import { ApiService } from "./api"
import { deploy } from "./commands/deploy"
import type { ConfigService } from "./config"
import { pickExistingApp, pickTeam } from "./pickers"
import type { App, Team } from "./types"

const AUTH_PROVIDER_ID = "fastapi-vscode"

interface AuthProvider {
  signOut(): Promise<void>
}

export class CloudController {
  private statusBarItem: vscode.StatusBarItem
  private currentApp: App | null = null
  private currentTeam: Team | null = null
  private hasConfig = false
  private workspaceRoot: vscode.Uri | null = null
  private refreshing = false
  private started = false

  constructor(
    private authProvider: AuthProvider,
    private configService: ConfigService,
    private apiService: ApiService,
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    )

    this.statusBarItem.command = "fastapi-vscode.cloudMenu"
  }

  showStatusBar() {
    this.statusBarItem.text = "$(cloud) FastAPI Cloud"
    this.statusBarItem.show()
    if (!this.started) {
      this.started = true
      vscode.authentication.onDidChangeSessions((e) => {
        if (e.provider.id === AUTH_PROVIDER_ID) this.refresh()
      })
    }
  }

  async initialize(workspaceRoot: vscode.Uri) {
    this.workspaceRoot = workspaceRoot
    this.configService.onConfigStateChanged(() => this.refresh())
    this.configService.startWatching(workspaceRoot)

    this.showStatusBar()
    await this.refresh()
  }

  async refresh() {
    if (this.refreshing) return
    this.refreshing = true
    try {
      const session = await vscode.authentication.getSession(
        AUTH_PROVIDER_ID,
        [],
        { silent: true },
      )
      if (!session) {
        this.statusBarItem.text = "$(cloud) Sign in to FastAPI Cloud"
        return
      }

      if (this.workspaceRoot) {
        const config = await this.configService.getConfig(this.workspaceRoot)

        if (!config) {
          console.log(
            "[FastAPI Cloud] No config found at",
            this.workspaceRoot.toString(),
          )
          this.hasConfig = false
          this.currentApp = null
          this.currentTeam = null
          this.statusBarItem.text = "$(cloud) Set up FastAPI Cloud"
          return
        }

        this.hasConfig = true

        try {
          this.currentApp = await this.apiService.getApp(config.app_id)
          this.currentTeam = await this.apiService.getTeam(config.team_id)

          if (this.currentApp) {
            this.statusBarItem.text = `$(cloud) ${this.currentApp.slug}`
          }
        } catch (err) {
          console.error("[FastAPI Cloud] Failed to fetch app/team:", err)
          this.currentApp = null
          this.currentTeam = null
          this.statusBarItem.text = "$(cloud) Set up FastAPI Cloud"
        }
      }
    } finally {
      this.refreshing = false
    }
  }

  async showMenu() {
    const session = await vscode.authentication.getSession(
      AUTH_PROVIDER_ID,
      [],
      { silent: true },
    )
    if (!session) {
      vscode.authentication.getSession(AUTH_PROVIDER_ID, [], {
        createIfNone: true,
      })
      return
    }

    if (!this.currentApp && !this.hasConfig) {
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
        placeHolder: "Set up FastAPI Cloud",
      })

      if (selected?.id === "link") {
        vscode.commands.executeCommand("fastapi-vscode.linkApp")
      } else if (selected?.id === "deploy") {
        await this.runDeploy()
      }
    } else if (!this.currentApp && this.hasConfig) {
      // Config exists but app fetch failed - warn and offer relink/unlink
      const selected = await vscode.window.showWarningMessage(
        "This project is linked to a FastAPI Cloud app that could not be found. Unlink it, then link to the correct app.",
        "Unlink",
      )

      if (selected === "Unlink") {
        await this.unlinkProject()
      }
    } else {
      const app = this.currentApp!
      const dashboardUrl = this.currentTeam
        ? ApiService.getDashboardUrl(this.currentTeam.slug, app.slug)
        : undefined
      const items = [
        {
          label: "$(cloud-upload) Deploy",
          description: "Push latest changes",
          id: "deploy",
        },
        {
          label: "$(globe) Open App",
          description: app.url,
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
        placeHolder: app.slug,
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
    await deploy(
      this.workspaceRoot,
      this.configService,
      this.apiService,
      this.statusBarItem,
    )
    await this.refresh()
  }

  async linkProject() {
    if (!this.workspaceRoot) {
      vscode.window.showErrorMessage("No workspace folder open")
      return
    }

    const team = await pickTeam(this.apiService)
    if (!team) return

    const app = await pickExistingApp(this.apiService, team)
    if (!app) return

    await this.configService.writeConfig(this.workspaceRoot, {
      app_id: app.id,
      team_id: team.id,
    })

    trackCloudProjectLinked()
    vscode.window.showInformationMessage(`Linked to ${app.slug}`)
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
      await this.authProvider.signOut()
      trackCloudSignOut()
      this.currentApp = null
      this.currentTeam = null
      await this.refresh()
    }
  }

  async unlinkProject() {
    if (!this.workspaceRoot || !this.hasConfig) {
      return
    }

    const label = this.currentApp?.slug ?? "this app"
    const confirm = await vscode.window.showWarningMessage(
      `Unlink "${label}" from this project?`,
      { modal: true },
      "Unlink",
    )

    if (confirm === "Unlink") {
      await this.configService.deleteConfig(this.workspaceRoot)
      trackCloudProjectUnlinked()
      this.currentApp = null
      this.currentTeam = null
      this.hasConfig = false
      await this.refresh()
    }
  }

  dispose() {
    this.statusBarItem.dispose()
  }
}
