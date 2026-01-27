import * as vscode from "vscode"
import type { AuthService } from "./auth"
import type { App, Deployment, ListResponse, Team } from "./types"

export interface UploadInfo {
  url: string
  fields: Record<string, string>
}

function getExtensionVersion(): string {
  return (
    vscode.extensions.getExtension("FastAPILabs.fastapi-vscode")?.packageJSON
      ?.version ?? "unknown"
  )
}

export class ApiService {
  public static readonly BASE_URL = "https://api.fastapicloud.com/api/v1"
  public static readonly DASHBOARD_URL = "https://dashboard.fastapicloud.com"

  constructor(private authService: AuthService) {}

  static getDashboardUrl(teamSlug: string, appSlug: string): string {
    return `${ApiService.DASHBOARD_URL}/${teamSlug}/apps/${appSlug}/general`
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await this.authService.getToken()
    if (!token) {
      throw new Error("Not authenticated")
    }

    const response = await fetch(`${ApiService.BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": `fastapi-vscode/${getExtensionVersion()}`,
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(
        `API request failed: ${options.method || "GET"} ${endpoint} returned ${response.status}`,
      )
    }

    return response.json() as Promise<T>
  }

  async getTeams(): Promise<Team[]> {
    const data = await this.request<ListResponse<Team>>("/teams")
    return data.data
  }

  async getTeam(teamId: string): Promise<Team> {
    return this.request<Team>(`/teams/${teamId}/`)
  }

  async getApps(teamId: string): Promise<App[]> {
    const data = await this.request<ListResponse<App>>(
      `/apps/?team_id=${teamId}`,
    )
    return data.data
  }

  async getApp(appId: string): Promise<App> {
    return this.request<App>(`/apps/${appId}`)
  }

  async createApp(teamId: string, name: string): Promise<App> {
    return this.request<App>("/apps/", {
      method: "POST",
      body: JSON.stringify({ team_id: teamId, name }),
    })
  }

  async createDeployment(appId: string): Promise<Deployment> {
    return this.request<Deployment>(`/apps/${appId}/deployments/`, {
      method: "POST",
    })
  }

  async getUploadUrl(deploymentId: string): Promise<UploadInfo> {
    return this.request<UploadInfo>(`/deployments/${deploymentId}/upload`, {
      method: "POST",
    })
  }

  async completeUpload(deploymentId: string): Promise<void> {
    await this.request<void>(`/deployments/${deploymentId}/upload-complete`, {
      method: "POST",
    })
  }

  async getDeployment(
    appId: string,
    deploymentId: string,
  ): Promise<Deployment> {
    return this.request<Deployment>(
      `/apps/${appId}/deployments/${deploymentId}/`,
    )
  }
}
