const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const srcDir = path.join(rootDir, "src");
const buildStamp = new Date().toISOString();

const bundles = [
  {
    name: "content.js",
    output: path.join(rootDir, "content.js"),
    wrap: true,
    files: [
      "content/main.js",
      "content/runtime/logger.js",
      "content/runtime/store.js",
      "content/runtime/backgroundApi.js",
      "content/runtime/controlPlane.js",
      "content/runtime/diagnostics.js",
      "@dir:content/modules",
      "content/adapters/shared.js",
      "content/adapters/ui.js",
      "content/adapters/diagnostics.js",
      "content/adapters/answers.js",
      "content/adapters/runner.js",
      "content/adapters/legacy.js",
      "content/ui/debugDrawer.js"
    ]
  },
  {
    name: "inject.js",
    output: path.join(rootDir, "inject.js"),
    wrap: true,
    files: [
      "inject/main.js",
      "@dir:inject/modules",
      "inject/runtime/diagnostics.js"
    ]
  },
  {
    name: "background.js",
    output: path.join(rootDir, "background.js"),
    wrap: true,
    files: [
      "background/main.js",
      "background/vault.js",
      "background/auth.js",
      "background/messages.js"
    ]
  },
  {
    name: "runtime-bridge.js",
    output: path.join(rootDir, "js", "runtime", "bridge.js"),
    wrap: false,
    files: ["runtime/bridge.js"]
  }
];

function normalizeLf(text) {
  return String(text).replace(/\r\n/g, "\n");
}

function unwrapCompatIife(content) {
  const lines = normalizeLf(content).split("\n");
  const start = lines.findIndex((line) => line.trim().startsWith("(function"));
  if (start >= 0) lines.splice(start, 1);

  let end = lines.length - 1;
  while (end >= 0 && !lines[end].trim()) end -= 1;
  if (end >= 0 && lines[end].trim() === "})();") lines.splice(end, 1);

  return lines.join("\n");
}

function readSource(relPath) {
  const absPath = path.join(srcDir, relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Missing source file: ${relPath}`);
  }
  const raw = fs.readFileSync(absPath, "utf8");
  return relPath.endsWith(".raw.js") ? unwrapCompatIife(raw) : normalizeLf(raw);
}

function collectJsFilesRecursive(absDir, relDir) {
  const files = [];
  fs.readdirSync(absDir, { withFileTypes: true }).forEach((item) => {
    const nextAbs = path.join(absDir, item.name);
    const nextRel = path.posix.join(relDir.replace(/\\/g, "/"), item.name);
    if (item.isDirectory()) {
      files.push(...collectJsFilesRecursive(nextAbs, nextRel));
      return;
    }
    if (item.isFile() && item.name.endsWith(".js")) {
      files.push(nextRel);
    }
  });
  return files;
}

function expandBundleEntries(entries) {
  const expanded = [];
  entries.forEach((entry) => {
    if (typeof entry !== "string" || !entry.startsWith("@dir:")) {
      expanded.push(entry);
      return;
    }
    const relDir = entry.slice("@dir:".length);
    const absDir = path.join(srcDir, relDir);
    if (!fs.existsSync(absDir)) {
      throw new Error(`Missing source directory: ${relDir}`);
    }
    const dirEntries = collectJsFilesRecursive(absDir, relDir)
      .sort();
    expanded.push(...dirEntries);
  });
  return expanded;
}

function renderBundle(bundle) {
  const header = [
    `// GENERATED FILE - DO NOT EDIT DIRECTLY`,
    `// Source bundle: ${bundle.name}`,
    `// Build stamp: ${buildStamp}`
  ].join("\n");

  const body = expandBundleEntries(bundle.files)
    .map((file) => `\n// -- ${file} --\n${readSource(file).trimEnd()}\n`)
    .join("");

  if (!bundle.wrap) {
    return `${header}\n${body}`;
  }

  return `${header}\n(function () {\n'use strict';\n${indent(body, 1)}\n})();\n`;
}

function indent(text, level) {
  const pad = "    ".repeat(level);
  return normalizeLf(text)
    .split("\n")
    .map((line) => (line ? `${pad}${line}` : ""))
    .join("\n");
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function build() {
  bundles.forEach((bundle) => {
    const output = renderBundle(bundle);
    ensureParentDir(bundle.output);
    fs.writeFileSync(bundle.output, output, "utf8");
    console.log(`[build] wrote ${path.relative(rootDir, bundle.output)}`);
  });
}

function watch() {
  build();
  console.log("[build] watching src/ ...");
  fs.watch(srcDir, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith(".js")) return;
    console.log(`[build] ${eventType}: ${filename}`);
    try {
      build();
    } catch (error) {
      console.error("[build] failed:", error.message);
    }
  });
}

if (process.argv.includes("--watch")) watch();
else build();
