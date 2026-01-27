import * as vscode from "vscode"
import { ApiService } from "../api"
import { ConfigService } from "../config"
import { pickExistingApp, pickTeam } from "../pickers"

export async function linkApp(workspaceRoot: vscode.Uri): Promise<boolean> {
  const apiService = ApiService.getInstance()
  const configService = ConfigService.getInstance()

  const team = await pickTeam(apiService)
  if (!team) return false

  const app = await pickExistingApp(apiService, team)
  if (!app) return false

  await configService.writeConfig(workspaceRoot, {
    app_id: app.id,
    team_id: team.id,
  })

  vscode.window.showInformationMessage(`Linked to ${app.slug}`)
  return true
}
