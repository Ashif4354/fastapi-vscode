import * as vscode from "vscode"
import { Parser } from "./core/parser"
import { buildRouterGraph } from "./core/routerResolver"
import { routerNodeToAppDefinition } from "./core/transformer"
import { EndpointTreeProvider } from "./providers/EndpointTreeProvider"
import type {
  AppDefinition,
  EndpointTreeItem,
  SourceLocation,
} from "./types/endpoint"

async function discoverFastAPIApps(parser: Parser): Promise<AppDefinition[]> {
  const apps: AppDefinition[] = []
  const workspaceFolders = vscode.workspace.workspaceFolders

  if (!workspaceFolders) {
    return apps
  }

  for (const folder of workspaceFolders) {
    // Check if user has configured a custom entry point
    const config = vscode.workspace.getConfiguration("fastapi", folder.uri)
    const customEntryPoint = config.get<string>("entryPoint")

    let entryPatterns: string[]
    if (customEntryPoint) {
      // Use only the custom entry point if configured
      entryPatterns = [customEntryPoint]
    } else {
      // Look for common FastAPI entry points
      entryPatterns = [
        "main.py",
        "app/main.py",
        "api/main.py",
        "src/main.py",
        "backend/app/main.py",
      ]
    }

    for (const pattern of entryPatterns) {
      const entryUri = vscode.Uri.joinPath(folder.uri, pattern)
      try {
        await vscode.workspace.fs.stat(entryUri)
        // File exists, try to build router graph
        // The project root for Python imports is the directory containing the entry file's parent package
        // e.g., for backend/app/main.py, the project root is backend/
        const entryDir = entryUri.fsPath.split("/").slice(0, -1).join("/")
        const pythonProjectRoot = entryDir.split("/").slice(0, -1).join("/")
        const routerNode = buildRouterGraph(
          entryUri.fsPath,
          parser,
          pythonProjectRoot,
        )
        if (routerNode) {
          const app = routerNodeToAppDefinition(routerNode, folder.uri.fsPath)
          apps.push(app)
          break // Found an entry point for this workspace
        }
      } catch {
        // File doesn't exist, try next pattern
      }
    }
  }

  return apps
}

function navigateToLocation(location: SourceLocation): void {
  if (!location.filePath) {
    vscode.window.showErrorMessage("File path is missing for the endpoint.")
    return
  }
  const uri = vscode.Uri.file(location.filePath)
  const position = new vscode.Position(location.line - 1, location.column)
  vscode.window.showTextDocument(uri, {
    selection: new vscode.Range(position, position),
  })
}

export async function activate(context: vscode.ExtensionContext) {
  const parserService = new Parser()
  await parserService.init({
    core: vscode.Uri.joinPath(
      context.extensionUri,
      "dist",
      "wasm",
      "web-tree-sitter.wasm",
    ).fsPath,
    python: vscode.Uri.joinPath(
      context.extensionUri,
      "dist",
      "wasm",
      "tree-sitter-python.wasm",
    ).fsPath,
  })

  // Discover FastAPI endpoints from workspace
  const apps = await discoverFastAPIApps(parserService)
  const endpointProvider = new EndpointTreeProvider(apps)

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "endpoint-explorer",
      endpointProvider,
    ),

    vscode.commands.registerCommand(
      "fastapi-vscode.refreshEndpoints",
      async () => {
        const newApps = await discoverFastAPIApps(parserService)
        endpointProvider.setApps(newApps)
      },
    ),

    vscode.commands.registerCommand(
      "fastapi-vscode.goToEndpoint",
      (item: EndpointTreeItem) => {
        if (item.type === "route") {
          navigateToLocation(item.route.location)
        }
      },
    ),

    vscode.commands.registerCommand(
      "fastapi-vscode.copyEndpointPath",
      (item: EndpointTreeItem) => {
        if (item.type === "route") {
          vscode.env.clipboard.writeText(item.route.path)
          vscode.window.showInformationMessage(`Copied: ${item.route.path}`)
        }
      },
    ),

    vscode.commands.registerCommand(
      "fastapi-vscode.goToRouter",
      (item: EndpointTreeItem) => {
        if (item.type === "router") {
          navigateToLocation(item.router.location)
        }
      },
    ),

    vscode.commands.registerCommand(
      "fastapi-vscode.copyRouterPrefix",
      (item: EndpointTreeItem) => {
        if (item.type === "router") {
          vscode.env.clipboard.writeText(item.router.prefix)
          vscode.window.showInformationMessage(`Copied: ${item.router.prefix}`)
        }
      },
    ),
  )
}

export function deactivate() {}
