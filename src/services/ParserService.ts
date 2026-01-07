import { readFileSync } from "node:fs"
import { Uri } from "vscode"
import { Language, Parser } from "web-tree-sitter"

export class ParserService {
  private parser: Parser | null = null

  async init(extensionUri: Uri) {
    if (this.parser) {
      return
    }

    const wasmPath = Uri.joinPath(
      extensionUri,
      "dist",
      "wasm",
      "web-tree-sitter.wasm",
    ).fsPath
    const wasmBinary = readFileSync(wasmPath)
    await Parser.init({ wasmBinary })

    this.parser = new Parser()

    const pythonWasmPath = Uri.joinPath(
      extensionUri,
      "dist",
      "wasm",
      "tree-sitter-python.wasm",
    ).fsPath
    const pythonWasmBinary = readFileSync(pythonWasmPath)
    const pythonLanguage = await Language.load(pythonWasmBinary)
    this.parser.setLanguage(pythonLanguage)

    console.log("ParserService initialized with Python language.")
  }

  parse(code: string) {
    if (!this.parser) {
      throw new Error("ParserService not initialized. Call init() first.")
    }

    return this.parser.parse(code)
  }

  dispose() {
    this.parser?.delete()
    console.log("ParserService disposed.")
  }
}
