// @ts-expect-error - tinytar has no type definitions
import { tar } from "tinytar"
import * as vscode from "vscode"
import {
  trackCloudAppOpened,
  trackCloudDashboardOpened,
} from "../../utils/telemetry"
import type { ApiService } from "../api"
import type { AuthService } from "../auth"
import type { ConfigService } from "../config"
import { pickOrCreateApp } from "../pickers"
import { type Deployment, DeploymentStatus } from "../types"

// Exclusion patterns - aligned with fastapi-cloud-cli plus VS Code extras
export const EXCLUDE_DIRS = new Set([
  // Core exclusions (same as CLI)
  ".venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".git",
  ".fastapicloud",
  // Additional exclusions for VS Code users
  "node_modules",
  ".ruff_cache",
  ".tox",
  "dist",
  "build",
])

const EXCLUDE_FILES = new Set([
  // CLI excludes these patterns
  ".gitignore",
  ".fastapicloudignore",
  // VS Code extras
  ".DS_Store",
  "Thumbs.db",
])

export function shouldExclude(relativePath: string): boolean {
  const parts = relativePath.split("/")
  const fileName = parts[parts.length - 1]

  // Check if any path component is in exclude list
  for (const part of parts) {
    if (EXCLUDE_DIRS.has(part)) return true
    if (part.endsWith(".egg-info")) return true
  }

  // Check file-level exclusions
  if (EXCLUDE_FILES.has(fileName)) return true
  if (fileName.startsWith(".env")) return true // .env, .env.local, etc.
  if (fileName.endsWith(".pyc")) return true // Same as CLI

  return false
}

export async function deploy(
  workspaceRoot: vscode.Uri,
  authService: AuthService,
  configService: ConfigService,
  apiService: ApiService,
  statusBar?: vscode.StatusBarItem,
): Promise<boolean> {
  const updateStatus = (text: string) => {
    if (statusBar) {
      statusBar.text = `$(sync~spin) ${text}`
    }
  }

  // Check auth
  if (!(await authService.isLoggedIn())) {
    const result = await vscode.window.showErrorMessage(
      "You need to sign in to deploy.",
      "Sign In",
    )
    if (result === "Sign In") {
      vscode.commands.executeCommand("fastapi-vscode.signIn")
    }
    return false
  }

  // Check/create config
  let config = await configService.getConfig(workspaceRoot)
  let appSlug: string | undefined

  if (!config) {
    // First deploy - need to configure app
    const folderName = workspaceRoot.path.split("/").pop() || "my-app"
    const selection = await pickOrCreateApp(apiService, folderName)
    if (!selection) return false

    config = { app_id: selection.app.id, team_id: selection.team.id }
    appSlug = selection.app.slug
    await configService.writeConfig(workspaceRoot, config)
  } else {
    // Fetch app to get slug for status bar
    try {
      const app = await apiService.getApp(config.app_id)
      appSlug = app.slug
    } catch {
      // Continue without slug - status bar will be updated by refresh
    }
  }

  try {
    updateStatus("Creating deployment...")
    const deployment = await apiService.createDeployment(config.app_id)

    updateStatus("Preparing files...")
    const archive = await createArchive(workspaceRoot)

    updateStatus("Uploading...")
    const uploadInfo = await apiService.getUploadUrl(deployment.id)
    await uploadToS3(uploadInfo.url, uploadInfo.fields, archive)

    updateStatus("Starting build...")
    await apiService.completeUpload(deployment.id)

    // Poll for deployment status
    const finalDeployment = await pollDeploymentStatus(
      apiService,
      config.app_id,
      deployment.id,
      updateStatus,
    )

    if (finalDeployment) {
      if (statusBar && appSlug) {
        statusBar.text = `$(cloud) ${appSlug}`
      }
      const action = await vscode.window.showInformationMessage(
        "Deployed successfully!",
        "Open App",
        "View Dashboard",
      )

      if (action === "Open App" && finalDeployment.url) {
        vscode.env.openExternal(vscode.Uri.parse(finalDeployment.url))
        trackCloudAppOpened()
      } else if (action === "View Dashboard" && finalDeployment.dashboard_url) {
        vscode.env.openExternal(vscode.Uri.parse(finalDeployment.dashboard_url))
        trackCloudDashboardOpened()
      }
      return true
    }
    if (statusBar) {
      statusBar.text = "$(cloud) Deploy failed"
    }
    const action = await vscode.window.showErrorMessage(
      "Deployment failed.",
      "View Logs",
    )
    if (action === "View Logs") {
      vscode.commands.executeCommand("fastapi-vscode.viewLogs")
    }
    return false
  } catch (error) {
    if (statusBar) {
      statusBar.text = "$(cloud) Deploy failed"
    }
    vscode.window.showErrorMessage(
      `Deploy failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    )
    return false
  }
}

async function createArchive(workspaceRoot: vscode.Uri): Promise<Uint8Array> {
  // Find all files, excluding common patterns via glob
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceRoot, "**/*"),
    "{**/.venv/**,**/__pycache__/**,**/.git/**,**/.fastapicloud/**,**/node_modules/**}",
  )

  const tarFiles: Array<{ name: string; data: Uint8Array }> = []

  for (const file of files) {
    const relativePath = file.path.replace(`${workspaceRoot.path}/`, "")

    // Additional filtering
    if (shouldExclude(relativePath)) continue

    try {
      const content = await vscode.workspace.fs.readFile(file)
      tarFiles.push({
        name: relativePath,
        data: new Uint8Array(content),
      })
    } catch {
      // Skip files we can't read
    }
  }

  return tar(tarFiles) as Uint8Array
}

async function uploadToS3(
  url: string,
  fields: Record<string, string>,
  archive: Uint8Array,
): Promise<void> {
  const formData = new FormData()

  // Add all presigned fields
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value)
  }

  // Add the file
  formData.append("file", new Blob([archive]))

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`)
  }
}

const MAX_POLL_ATTEMPTS = 300 // 10 minutes at 2 second intervals

async function pollDeploymentStatus(
  apiService: ApiService,
  appId: string,
  deploymentId: string,
  updateStatus: (text: string) => void,
): Promise<Deployment | null> {
  const failedStatuses = [
    DeploymentStatus.extracting_failed,
    DeploymentStatus.building_image_failed,
    DeploymentStatus.deploying_failed,
    DeploymentStatus.verifying_failed,
    DeploymentStatus.failed,
  ]

  const statusMessages: Record<string, string> = {
    [DeploymentStatus.waiting_upload]: "Waiting for upload...",
    [DeploymentStatus.ready_for_build]: "Ready for build...",
    [DeploymentStatus.building]: "Building...",
    [DeploymentStatus.extracting]: "Extracting...",
    [DeploymentStatus.building_image]: "Building image...",
    [DeploymentStatus.deploying]: "Deploying...",
    [DeploymentStatus.verifying]: "Verifying...",
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const deployment = await apiService.getDeployment(appId, deploymentId)

    if (
      deployment.status === DeploymentStatus.success ||
      deployment.status === DeploymentStatus.verifying_skipped
    ) {
      return deployment
    }

    if (failedStatuses.includes(deployment.status)) {
      return null
    }

    const message =
      statusMessages[deployment.status] || `Status: ${deployment.status}`
    updateStatus(message)

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  // Timeout
  return null
}
