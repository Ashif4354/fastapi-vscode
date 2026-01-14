import { copyFileSync, globSync, mkdirSync } from "node:fs"
import path from "node:path"
import esbuild from "esbuild"

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")

function copyWasmFiles() {
  const wasmDestDir = path.join(import.meta.dirname, "dist", "wasm")
  mkdirSync(wasmDestDir, { recursive: true })

  const wasmFiles = [
    ["web-tree-sitter", "web-tree-sitter.wasm"],
    ["tree-sitter-python", "tree-sitter-python.wasm"],
  ]

  for (const [pkg, file] of wasmFiles) {
    const src = path.join(import.meta.dirname, "node_modules", pkg, file)
    copyFileSync(src, path.join(wasmDestDir, file))
    console.log(`Copied ${file} -> dist/wasm/`)
  }
}

async function main() {
  copyWasmFiles()

  const entryPoints = ["src/extension.ts"]
  if (!production) {
    entryPoints.push(...globSync("src/test/**/*.test.ts"))
  }

  const ctx = await esbuild.context({
    entryPoints,
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    target: "node20",
    treeShaking: true,
    outdir: "dist",
    outbase: "src",
    external: ["vscode", "web-tree-sitter"],
    logLevel: "info",
    define: {
      "process.env.NODE_ENV": production ? '"production"' : '"development"',
    },
  })

  if (watch) {
    await ctx.watch()
    console.log("Watching for changes...")
  } else {
    await ctx.rebuild()
    await ctx.dispose()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
