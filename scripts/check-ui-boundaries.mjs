#!/usr/bin/env node
/**
 * Asserts that organization UI libraries and organization applications never
 * depend on or import Heavy Rain's operator system UI (@heavy-rain/system-ui
 * or packages/heavy-rain-ui).
 *
 * Inspects package.json dependency tables and comment-stripped module imports,
 * re-exports, dynamic imports, CommonJS requires, and CSS @import rules while
 * ignoring build outputs and installed dependencies.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".vite",
  ".git",
  ".next",
  ".turbo",
  "out",
]);

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".css",
]);

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/**
 * Replaces // line comments and /* block comments *\/ with spaces while
 * preserving newline positions so reported line numbers match the source file.
 * Single- and double-quoted strings reset at newlines so apostrophes inside
 * JSX prose cannot mask imports on subsequent lines.
 */
export function stripCommentsPreservingLines(source) {
  let out = "";
  let i = 0;
  const len = source.length;
  let state = "code"; // "code" | "single" | "double" | "template" | "line-comment" | "block-comment"

  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === "code") {
      if (ch === "/" && next === "/") {
        out += "  ";
        i += 2;
        state = "line-comment";
        continue;
      }
      if (ch === "/" && next === "*") {
        out += "  ";
        i += 2;
        state = "block-comment";
        continue;
      }
      if (ch === "'") {
        out += ch;
        i += 1;
        state = "single";
        continue;
      }
      if (ch === '"') {
        out += ch;
        i += 1;
        state = "double";
        continue;
      }
      if (ch === "`") {
        out += ch;
        i += 1;
        state = "template";
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    if (state === "line-comment") {
      if (ch === "\n") {
        out += "\n";
        state = "code";
      } else {
        out += " ";
      }
      i += 1;
      continue;
    }

    if (state === "block-comment") {
      if (ch === "*" && next === "/") {
        out += "  ";
        i += 2;
        state = "code";
      } else {
        out += ch === "\n" ? "\n" : " ";
        i += 1;
      }
      continue;
    }

    if (state === "single") {
      out += ch;
      if (ch === "\\" && i + 1 < len) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      if (ch === "'" || ch === "\n") {
        state = "code";
      }
      i += 1;
      continue;
    }

    if (state === "double") {
      out += ch;
      if (ch === "\\" && i + 1 < len) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "\n") {
        state = "code";
      }
      i += 1;
      continue;
    }

    if (state === "template") {
      out += ch;
      if (ch === "\\" && i + 1 < len) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      if (ch === "`") {
        state = "code";
      }
      i += 1;
    }
  }

  return out;
}

export function isForbiddenSystemUiSpecifier(specifier) {
  const normalized = specifier.trim().replace(/\\/g, "/");
  if (
    normalized === "@heavy-rain/system-ui" ||
    normalized.startsWith("@heavy-rain/system-ui/") ||
    normalized === "@heavy-rain/heavy-rain-ui" ||
    normalized.startsWith("@heavy-rain/heavy-rain-ui/") ||
    normalized === "@heavy-rain/system" ||
    normalized.startsWith("@heavy-rain/system/")
  ) {
    return true;
  }

  if (
    /(?:^|\/)packages\/heavy-rain-ui(?:\/|$)/.test(normalized) ||
    /(?:^|\/)heavy-rain-ui(?:\/|$)/.test(normalized) ||
    /(?:^|\/)apps\/system(?:\/|$)/.test(normalized)
  ) {
    return true;
  }

  return false;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === "\n") {
      line += 1;
    }
  }
  return line;
}

export function extractModuleSpecifiers(rawSource, ext = ".tsx") {
  const stripped = stripCommentsPreservingLines(rawSource);
  const found = [];

  if (ext === ".css") {
    const cssImportRe = /@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)['"]?\s*\)?/g;
    for (const match of stripped.matchAll(cssImportRe)) {
      found.push({
        kind: "css-@import",
        specifier: match[1],
        line: lineNumberAt(stripped, match.index ?? 0),
      });
    }
    return found;
  }

  const patterns = [
    {
      kind: "import-from",
      re: /(?:^|[;\n])\s*import\s+(?:type\s+)?[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    },
    {
      kind: "side-effect-import",
      re: /(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g,
    },
    {
      kind: "re-export",
      re: /(?:^|[;\n])\s*export\s+(?:type\s+)?(?:\*(?:\s+as\s+[A-Za-z0-9_$]+)?|\{[\s\S]*?\})\s*from\s*['"]([^'"]+)['"]/g,
    },
    {
      kind: "dynamic-import",
      re: /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    },
    {
      kind: "require",
      re: /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    },
  ];

  for (const { kind, re } of patterns) {
    for (const match of stripped.matchAll(re)) {
      const specifierOffset = match[0].lastIndexOf(match[1]);
      const index = (match.index ?? 0) + Math.max(0, specifierOffset);
      found.push({
        kind,
        specifier: match[1],
        line: lineNumberAt(stripped, index),
      });
    }
  }

  return found;
}

function collectOrganizationTargets(rootDir) {
  const targets = [];
  const orgUiDir = path.join(rootDir, "packages", "organization-ui");
  if (fs.existsSync(orgUiDir)) {
    targets.push(orgUiDir);
  }

  const org3dDir = path.join(rootDir, "packages", "organization-3d");
  if (fs.existsSync(org3dDir)) {
    targets.push(org3dDir);
  }

  const bdmdDir = path.join(rootDir, "HeavyRain_BDMD", "frontend");
  if (fs.existsSync(bdmdDir)) {
    targets.push(bdmdDir);
  }

  const appsDir = path.join(rootDir, "apps");
  if (fs.existsSync(appsDir)) {
    for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "system" || IGNORED_DIRS.has(entry.name)) continue;
      targets.push(path.join(appsDir, entry.name));
    }
  }

  return targets;
}

function walkDirectory(dir, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(fullPath, onFile);
    } else if (entry.isFile()) {
      onFile(fullPath);
    }
  }
}

export function checkWorkspaceBoundaries(rootDir = ROOT_DIR) {
  const targets = collectOrganizationTargets(rootDir);
  const violations = [];
  let scannedFiles = 0;

  for (const targetDir of targets) {
    walkDirectory(targetDir, (filePath) => {
      const relPath = path.relative(rootDir, filePath);
      const baseName = path.basename(filePath);
      const ext = path.extname(filePath);

      if (baseName === "package.json") {
        scannedFiles += 1;
        const pkgRaw = fs.readFileSync(filePath, "utf8");
        const pkg = JSON.parse(pkgRaw);
        for (const field of DEP_FIELDS) {
          const deps = pkg[field];
          if (!deps || typeof deps !== "object") continue;
          for (const [depName, depSpec] of Object.entries(deps)) {
            if (
              isForbiddenSystemUiSpecifier(depName) ||
              (typeof depSpec === "string" && isForbiddenSystemUiSpecifier(depSpec))
            ) {
              violations.push({
                file: relPath,
                line: 1,
                kind: `package.json#${field}`,
                specifier: `${depName}: ${String(depSpec)}`,
              });
            }
          }
        }
        return;
      }

      if (!CODE_EXTENSIONS.has(ext)) return;
      scannedFiles += 1;
      const content = fs.readFileSync(filePath, "utf8");
      const specifiers = extractModuleSpecifiers(content, ext);

      for (const item of specifiers) {
        if (isForbiddenSystemUiSpecifier(item.specifier)) {
          violations.push({
            file: relPath,
            line: item.line,
            kind: item.kind,
            specifier: item.specifier,
          });
        }
      }
    });
  }

  return {
    targets: targets.map((dir) => path.relative(rootDir, dir)),
    scannedFiles,
    violations,
  };
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const result = checkWorkspaceBoundaries(ROOT_DIR);

  if (result.violations.length > 0) {
    console.error(
      `UI boundary check failed: organization packages/apps must not import @heavy-rain/system-ui or packages/heavy-rain-ui.`,
    );
    for (const v of result.violations) {
      console.error(`  - ${v.file}:${v.line} [${v.kind}] -> "${v.specifier}"`);
    }
    process.exit(1);
  }

  console.log(
    `UI boundary check passed (${result.scannedFiles} files inspected across ${result.targets.join(", ") || "no targets"}).`,
  );
}
