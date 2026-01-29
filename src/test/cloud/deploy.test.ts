import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { ApiService } from "../../cloud/api"
import { deploy, shouldExclude } from "../../cloud/commands/deploy"
import { ConfigService } from "../../cloud/config"
import { DeploymentStatus } from "../../cloud/types"
import { mockResponse } from "../testUtils"

const testApp = {
  id: "a1",
  slug: "test-app",
  url: "https://test-app.dev",
  team_id: "t1",
}

function createServices() {
  const configService = new ConfigService()
  const apiService = new ApiService()
  return { configService, apiService }
}

const mockSession = {
  accessToken: "test_token",
  id: "fastapi-cloud-session",
  account: { id: "fastapi-cloud-account", label: "FastAPI Cloud" },
  scopes: [],
} as vscode.AuthenticationSession

const defaultDeployment = {
  id: "d1",
  slug: "d1",
  status: DeploymentStatus.waiting_upload,
  url: "",
  dashboard_url: "",
}

const successDeployment = {
  id: "d1",
  slug: "d1",
  status: DeploymentStatus.success,
  url: "https://test-app.dev",
  dashboard_url: "https://dashboard.example.com",
}

function stubSuccessfulDeploy(services: {
  configService: ConfigService
  apiService: ApiService
}) {
  sinon.stub(vscode.authentication, "getSession").resolves(mockSession as any)
  sinon
    .stub(services.configService, "getConfig")
    .resolves({ app_id: "a1", team_id: "t1" })
  sinon.stub(services.apiService, "getApp").resolves(testApp)
  sinon
    .stub(services.apiService, "createDeployment")
    .resolves(defaultDeployment)
  sinon.stub(vscode.workspace, "findFiles").resolves([])
  sinon
    .stub(services.apiService, "getUploadUrl")
    .resolves({ url: "https://s3.example.com/upload", fields: {} })
  sinon.stub(globalThis, "fetch").resolves(mockResponse({}))
  sinon.stub(services.apiService, "completeUpload").resolves()
  sinon.stub(services.apiService, "getDeployment").resolves(successDeployment)
}

suite("cloud/deploy", () => {
  teardown(() => sinon.restore())

  suite("shouldExclude", () => {
    test("excludes expected directories", () => {
      assert.ok(shouldExclude(".venv/lib/python3.11/site.py"))
      assert.ok(shouldExclude("__pycache__/module.cpython-311.pyc"))
      assert.ok(shouldExclude(".git/config"))
      assert.ok(shouldExclude(".fastapicloud/cloud.json"))
      assert.ok(shouldExclude("node_modules/express/index.js"))
    })

    test("excludes .egg-info directories", () => {
      assert.ok(shouldExclude("mypackage.egg-info/PKG-INFO"))
    })

    test("excludes .env files", () => {
      assert.ok(shouldExclude(".env"))
      assert.ok(shouldExclude(".env.local"))
      assert.ok(shouldExclude(".env.production"))
    })

    test("excludes .pyc files", () => {
      assert.ok(shouldExclude("module.pyc"))
    })

    test("excludes specific files from EXCLUDE_FILES", () => {
      assert.ok(shouldExclude(".gitignore"))
      assert.ok(shouldExclude(".fastapicloudignore"))
      assert.ok(shouldExclude(".DS_Store"))
      assert.ok(shouldExclude("Thumbs.db"))
      assert.ok(shouldExclude("src/.gitignore"))
    })

    test("includes regular source files", () => {
      assert.ok(!shouldExclude("main.py"))
      assert.ok(!shouldExclude("src/app.py"))
      assert.ok(!shouldExclude("requirements.txt"))
      assert.ok(!shouldExclude("pyproject.toml"))
    })
  })

  suite("deploy", () => {
    let services: ReturnType<typeof createServices>
    const workspaceRoot = vscode.Uri.file("/tmp/test")

    setup(() => {
      services = createServices()
    })

    teardown(() => {
      services.configService.dispose()
    })

    test("returns false when not logged in", async () => {
      sinon.stub(vscode.authentication, "getSession").resolves(null as any)
      const errorStub = sinon
        .stub(vscode.window, "showErrorMessage")
        .resolves(undefined as any)

      const result = await deploy(
        workspaceRoot,
        services.configService,
        services.apiService,
      )

      assert.ok(!result)
      assert.ok(errorStub.calledOnce)
    })

    test("prompts sign in when user clicks Sign In", async () => {
      sinon.stub(vscode.authentication, "getSession").resolves(null as any)
      sinon.stub(vscode.window, "showErrorMessage").resolves("Sign In" as any)
      const execStub = sinon.stub(vscode.commands, "executeCommand").resolves()

      await deploy(workspaceRoot, services.configService, services.apiService)

      assert.ok(execStub.calledOnceWith("fastapi-vscode.signIn"))
    })

    test("returns false when no config and user cancels", async () => {
      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(services.configService, "getConfig").resolves(null)

      sinon.stub(globalThis, "fetch").resolves(mockResponse({ data: [] }))
      sinon.stub(vscode.window, "showErrorMessage")

      const result = await deploy(
        workspaceRoot,
        services.configService,
        services.apiService,
      )

      assert.ok(!result)
    })

    test("deploys successfully with existing config", async () => {
      const clock = sinon.useFakeTimers({ shouldAdvanceTime: true })

      stubSuccessfulDeploy(services)
      sinon
        .stub(vscode.window, "showInformationMessage")
        .resolves(undefined as any)

      const result = await deploy(
        workspaceRoot,
        services.configService,
        services.apiService,
      )

      assert.ok(result)

      clock.restore()
    })

    test("returns false when deployment fails", async () => {
      const clock = sinon.useFakeTimers({ shouldAdvanceTime: true })

      stubSuccessfulDeploy(services)
      ;(services.apiService.getDeployment as sinon.SinonStub).resolves({
        ...successDeployment,
        status: DeploymentStatus.building_image_failed,
        url: "",
        dashboard_url: "",
      })
      sinon.stub(vscode.window, "showErrorMessage").resolves(undefined as any)

      const result = await deploy(
        workspaceRoot,
        services.configService,
        services.apiService,
      )

      assert.ok(!result)

      clock.restore()
    })

    test("returns false when createDeployment throws", async () => {
      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon
        .stub(services.configService, "getConfig")
        .resolves({ app_id: "a1", team_id: "t1" })
      sinon.stub(services.apiService, "getApp").resolves(testApp)
      sinon
        .stub(services.apiService, "createDeployment")
        .rejects(new Error("API error"))
      sinon.stub(vscode.window, "showErrorMessage")

      const result = await deploy(
        workspaceRoot,
        services.configService,
        services.apiService,
      )

      assert.ok(!result)
    })

    test("opens app when user clicks Open App", async () => {
      const clock = sinon.useFakeTimers({ shouldAdvanceTime: true })

      stubSuccessfulDeploy(services)
      sinon
        .stub(vscode.window, "showInformationMessage")
        .resolves("Open App" as any)
      const openStub = sinon.stub(vscode.env, "openExternal")

      await deploy(workspaceRoot, services.configService, services.apiService)

      assert.ok(openStub.calledOnce)

      clock.restore()
    })

    test("opens dashboard when user clicks View Dashboard", async () => {
      const clock = sinon.useFakeTimers({ shouldAdvanceTime: true })

      stubSuccessfulDeploy(services)
      sinon
        .stub(vscode.window, "showInformationMessage")
        .resolves("View Dashboard" as any)
      const openStub = sinon.stub(vscode.env, "openExternal")

      await deploy(workspaceRoot, services.configService, services.apiService)

      assert.ok(openStub.calledOnce)

      clock.restore()
    })

    test("updates status bar text during deploy", async () => {
      const clock = sinon.useFakeTimers({ shouldAdvanceTime: true })

      const statusBar = {
        text: "",
        show: sinon.stub(),
        hide: sinon.stub(),
        dispose: sinon.stub(),
      } as unknown as vscode.StatusBarItem

      stubSuccessfulDeploy(services)
      sinon
        .stub(vscode.window, "showInformationMessage")
        .resolves(undefined as any)

      await deploy(
        workspaceRoot,
        services.configService,
        services.apiService,
        statusBar,
      )

      assert.strictEqual(statusBar.text, "$(cloud) test-app")

      clock.restore()
    })

    test("shows deploy failed in status bar on error", async () => {
      const statusBar = {
        text: "",
        show: sinon.stub(),
        hide: sinon.stub(),
        dispose: sinon.stub(),
      } as unknown as vscode.StatusBarItem

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon
        .stub(services.configService, "getConfig")
        .resolves({ app_id: "a1", team_id: "t1" })
      sinon.stub(services.apiService, "getApp").resolves(testApp)
      sinon
        .stub(services.apiService, "createDeployment")
        .rejects(new Error("API error"))
      sinon.stub(vscode.window, "showErrorMessage")

      await deploy(
        workspaceRoot,
        services.configService,
        services.apiService,
        statusBar,
      )

      assert.strictEqual(statusBar.text, "$(cloud) Deploy failed")
    })

    test("continues without slug when getApp throws", async () => {
      const clock = sinon.useFakeTimers({ shouldAdvanceTime: true })

      stubSuccessfulDeploy(services)
      ;(services.apiService.getApp as sinon.SinonStub).rejects(
        new Error("Not found"),
      )
      sinon
        .stub(vscode.window, "showInformationMessage")
        .resolves(undefined as any)

      const result = await deploy(
        workspaceRoot,
        services.configService,
        services.apiService,
      )

      assert.ok(result)

      clock.restore()
    })

    test("deploys with first-time config via pickOrCreateApp", async () => {
      const clock = sinon.useFakeTimers({ shouldAdvanceTime: true })

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(services.configService, "getConfig").resolves(null)

      sinon
        .stub(services.apiService, "getTeams")
        .resolves([{ id: "t1", name: "Team 1", slug: "team-1" }])

      const quickPickStub = sinon.stub(vscode.window, "showQuickPick")
      quickPickStub
        .onFirstCall()
        .resolves({ label: "Create new app", id: "new" } as any)

      sinon.stub(vscode.window, "showInputBox").resolves("my-app")
      sinon.stub(services.apiService, "createApp").resolves({
        id: "a1",
        slug: "my-app",
        url: "https://my-app.dev",
        team_id: "t1",
      })

      const writeStub = sinon
        .stub(services.configService, "writeConfig")
        .resolves()

      sinon
        .stub(services.apiService, "createDeployment")
        .resolves(defaultDeployment)
      sinon.stub(vscode.workspace, "findFiles").resolves([])
      sinon
        .stub(services.apiService, "getUploadUrl")
        .resolves({ url: "https://s3.example.com/upload", fields: {} })
      sinon.stub(globalThis, "fetch").resolves(mockResponse({}))
      sinon.stub(services.apiService, "completeUpload").resolves()
      sinon.stub(services.apiService, "getDeployment").resolves({
        ...successDeployment,
        url: "https://my-app.dev",
        dashboard_url: "",
      })
      sinon
        .stub(vscode.window, "showInformationMessage")
        .resolves(undefined as any)

      const result = await deploy(
        workspaceRoot,
        services.configService,
        services.apiService,
      )

      assert.ok(result)
      assert.ok(writeStub.calledOnce)

      clock.restore()
    })

    test("shows View Logs on failed deployment", async () => {
      const clock = sinon.useFakeTimers({ shouldAdvanceTime: true })

      const statusBar = {
        text: "",
        show: sinon.stub(),
        hide: sinon.stub(),
        dispose: sinon.stub(),
      } as unknown as vscode.StatusBarItem

      stubSuccessfulDeploy(services)
      ;(services.apiService.getDeployment as sinon.SinonStub).resolves({
        ...successDeployment,
        status: DeploymentStatus.failed,
        url: "",
        dashboard_url: "",
      })
      sinon.stub(vscode.window, "showErrorMessage").resolves("View Logs" as any)
      const execStub = sinon.stub(vscode.commands, "executeCommand").resolves()

      const result = await deploy(
        workspaceRoot,
        services.configService,
        services.apiService,
        statusBar,
      )

      assert.ok(!result)
      assert.strictEqual(statusBar.text, "$(cloud) Deploy failed")
      assert.ok(execStub.calledOnceWith("fastapi-vscode.viewLogs"))

      clock.restore()
    })

    test("archives files and filters excluded ones", async () => {
      const clock = sinon.useFakeTimers({ shouldAdvanceTime: true })
      const originalFs = vscode.workspace.fs

      try {
        sinon
          .stub(vscode.authentication, "getSession")
          .resolves(mockSession as any)
        sinon
          .stub(services.configService, "getConfig")
          .resolves({ app_id: "a1", team_id: "t1" })
        sinon.stub(services.apiService, "getApp").resolves(testApp)
        sinon
          .stub(services.apiService, "createDeployment")
          .resolves(defaultDeployment)

        sinon
          .stub(vscode.workspace, "findFiles")
          .resolves([
            vscode.Uri.file("/tmp/test/main.py"),
            vscode.Uri.file("/tmp/test/.env"),
            vscode.Uri.file("/tmp/test/unreadable.py"),
          ])

        const fakeReadFile = sinon.stub()
        fakeReadFile
          .withArgs(
            sinon.match((uri: vscode.Uri) => uri.path.endsWith("main.py")),
          )
          .resolves(Buffer.from("print('hello')"))
        fakeReadFile
          .withArgs(
            sinon.match((uri: vscode.Uri) =>
              uri.path.endsWith("unreadable.py"),
            ),
          )
          .rejects(new Error("Permission denied"))
        Object.defineProperty(vscode.workspace, "fs", {
          value: { ...originalFs, readFile: fakeReadFile },
          configurable: true,
        })

        sinon
          .stub(services.apiService, "getUploadUrl")
          .resolves({ url: "https://s3.example.com/upload", fields: {} })
        sinon.stub(globalThis, "fetch").resolves(mockResponse({}))
        sinon.stub(services.apiService, "completeUpload").resolves()
        sinon
          .stub(services.apiService, "getDeployment")
          .resolves(successDeployment)
        sinon
          .stub(vscode.window, "showInformationMessage")
          .resolves(undefined as any)

        const result = await deploy(
          workspaceRoot,
          services.configService,
          services.apiService,
        )

        assert.ok(result)
        assert.ok(
          fakeReadFile.calledWith(
            sinon.match((uri: vscode.Uri) => uri.path.endsWith("main.py")),
          ),
        )
      } finally {
        Object.defineProperty(vscode.workspace, "fs", {
          value: originalFs,
          configurable: true,
        })
        clock.restore()
      }
    })

    test("polls with status messages before success", async () => {
      const clock = sinon.useFakeTimers({ shouldAdvanceTime: true })

      stubSuccessfulDeploy(services)
      const getDeploymentStub = services.apiService
        .getDeployment as sinon.SinonStub
      getDeploymentStub.resetBehavior()
      getDeploymentStub.onFirstCall().resolves({
        ...successDeployment,
        status: DeploymentStatus.building,
        url: "",
        dashboard_url: "",
      })
      getDeploymentStub.onSecondCall().resolves(successDeployment)

      sinon
        .stub(vscode.window, "showInformationMessage")
        .resolves(undefined as any)

      const deployPromise = deploy(
        workspaceRoot,
        services.configService,
        services.apiService,
      )

      await clock.tickAsync(2500)

      const result = await deployPromise

      assert.ok(result)
      assert.strictEqual(getDeploymentStub.callCount, 2)

      clock.restore()
    })
  })
})
