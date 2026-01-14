import { copyFileSync, globSync, mkdirSync } from "node:fs"
import path from "node:path"
import esbuild from "esbuild"

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")

function copyWasmFiles() {
  const wasmDestDir = path.join(import.meta.dirname, "dist", "wasm")
  mkdirSync(wasmDestDir, { recursive: true })

  // web-tree-sitter.wasm from node_modules
  const coreSrc = path.join(
    import.meta.dirname,
    "node_modules",
    "web-tree-sitter",
    "web-tree-sitter.wasm",
  )
  copyFileSync(coreSrc, path.join(wasmDestDir, "web-tree-sitter.wasm"))
  console.log("Copied web-tree-sitter.wasm -> dist/wasm/")

  // tree-sitter-python.wasm from wasm/ directory (checked into repo)
  const pythonSrc = path.join(
    import.meta.dirname,
    "wasm",
    "tree-sitter-python.wasm",
  )
  copyFileSync(pythonSrc, path.join(wasmDestDir, "tree-sitter-python.wasm"))
  console.log("Copied tree-sitter-python.wasm -> dist/wasm/")
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
      __DIST_ROOT__: JSON.stringify(path.join(import.meta.dirname, "dist")),
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
