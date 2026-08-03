"use strict"

// Rule "no-unused-dependencies": report a package.json dependency that nothing in the repo uses.
//
// Why this rule exists: package.json only ever grows. 14_portfolio still ships `ioredis` from a rate
// limiting idea that was never wired up - 2MB and its own dependency tree, installed on every CI run
// for nothing, and no way to tell it apart from a package the app truly needs. Same shape as
// no-unused-envs, which does this for env.d.ts declarations.
//
// It runs ON package.json through the local `json` processor, so the warning lands on the dependency
// line itself.
//
// A package counts as USED when any of these mention it, because each is a real way to depend on
// something without an import statement:
//
//   1. an import specifier in any source file - "pkg" or a subpath "pkg/sub"
//   2. a bare-name mention in a config file (tailwind.config.ts naming a plugin, postcss.config.js)
//   3. a bare-name mention in a package.json script (a CLI binary: next, vitest, chromatic, tsc)
//   4. a bare-name mention in a CI workflow
//
// And these are never reported, because they are named in config rather than imported and reporting
// them would be noise on every lint:
//
//   - @types/*            TypeScript picks these up from the folder, no file ever names them
//   - eslint / eslint-config-* / eslint-plugin-* / @typescript-eslint/*   named in eslint config
//   - the framework floor: next, react, react-dom, typescript, postcss, autoprefixer, tailwindcss
//
// Never fixable, on purpose - same reasoning as no-unused-envs. A reported package has two possible
// settlements and only the owner knows which: it is read somewhere this walk does not look (a
// Dockerfile, a deploy script), or it is genuinely left over and the line should go. Removing it is
// also not free: `pnpm remove` re-resolves the lockfile, and several of these repos pin dependencies
// to "latest", where a re-resolve has broken eslint before.

const fs = require("fs")
const path = require("path")

const SKIPPED_FOLDERS = new Set(["node_modules", "out", "build", "dist", "coverage", "storybook-static"])

// Most dot-folders hold tooling state rather than this repo's own source - build output, git
// internals, downloaded browser binaries - so the default for a dot-folder is to skip it, and a new
// one added next year is skipped without touching this rule.
//
// These two are the exceptions, and both were found the hard way: .storybook/main.ts names every
// @storybook/addon-* by hand, and a .github workflow names the binaries a CI step runs. Skipping
// them reported six perfectly good packages as unused.
const WALKED_DOT_FOLDERS = new Set([".github", ".storybook"])

function isSkippedFolder(name) {
  return SKIPPED_FOLDERS.has(name) || (name.startsWith(".") && !WALKED_DOT_FOLDERS.has(name))
}

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
const EXTRA_TEXT_FILES = /(\.config\.(ts|js|mjs|cjs)|\.eslintrc\.json|\.ya?ml|Dockerfile|\.sh)$/

// A lockfile names EVERY installed package, so reading one marks every dependency as used and the
// rule goes permanently silent. This is not hypothetical: ioredis appears 6 times in
// 14_portfolio/pnpm-lock.yaml while no source file imports it, which is the exact case this rule was
// written for. The .yaml pattern above is what pulls it in, so it is excluded by name here.
const LOCKFILES = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "npm-shrinkwrap.json"])

// Named in a config or run by the toolchain, never imported by a source file.
const NEVER_REPORTED = new Set([
  "eslint",
  "typescript",
  "next",
  "react",
  "react-dom",
  "postcss",
  "autoprefixer",
  "tailwindcss",
  "prettier",
  "pnpm",
])

const NEVER_REPORTED_PREFIXES = [
  "@types/",
  "eslint-config-",
  "eslint-plugin-",
  "@typescript-eslint/",
  "@next/",
  "@eslint/",
]

const IMPORT_PATTERN = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g
const IDENTIFIER_PATTERN = /[@\w][\w./-]*/g

// One entry per repo root, filled by the first lint of that repo and reused for the rest of the
// process - package.json holds dozens of dependencies and each asks the same question.
const usedByRepoRoot = new Map()

function isNeverReported(name) {
  return NEVER_REPORTED.has(name) || NEVER_REPORTED_PREFIXES.some(prefix => name.startsWith(prefix))
}

/** "react-icons/fa" -> "react-icons", "@upstash/redis/nodejs" -> "@upstash/redis" */
function packageOfSpecifier(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null
  const parts = specifier.split("/")

  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

function collectUsed(repoRoot) {
  const alreadyWalked = usedByRepoRoot.get(repoRoot)
  if (alreadyWalked !== undefined) return alreadyWalked

  const importedPackages = new Set()
  const mentionedTokens = new Set()
  const pendingFolders = [repoRoot]

  while (pendingFolders.length > 0) {
    const folder = pendingFolders.pop()
    let entries
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(folder, entry.name)
      if (entry.isDirectory()) {
        if (!isSkippedFolder(entry.name)) pendingFolders.push(fullPath)
        continue
      }

      if (LOCKFILES.has(entry.name)) continue

      const isSource = SOURCE_EXTENSIONS.some(extension => entry.name.endsWith(extension))
      // Everything inside a config folder counts as text, not just as source. .storybook/main.ts
      // lists its addons as bare strings in an array - `addons: ["@storybook/addon-a11y", ...]` -
      // which is a real use that no import statement ever spells out.
      const insideConfigFolder = [...WALKED_DOT_FOLDERS].some(name => fullPath.includes(`${path.sep}${name}${path.sep}`))
      const isExtraText = EXTRA_TEXT_FILES.test(entry.name) || insideConfigFolder
      if (!isSource && !isExtraText) continue

      let text
      try {
        text = fs.readFileSync(fullPath, "utf8")
      } catch {
        continue
      }

      if (isSource) {
        for (const match of text.matchAll(IMPORT_PATTERN)) {
          const owner = packageOfSpecifier(match[1])
          if (owner) importedPackages.add(owner)
        }
      }

      // A config file, a workflow or a shell script names a package as a bare word - a plugin in
      // tailwind.config.ts, a binary in a CI step. Token matching is deliberately loose here: a
      // false "used" is invisible, a false "unused" wastes his time.
      if (isExtraText) for (const token of text.match(IDENTIFIER_PATTERN) ?? []) mentionedTokens.add(token)
    }
  }

  const used = { importedPackages, mentionedTokens }
  usedByRepoRoot.set(repoRoot, used)

  return used
}

/**
 * Every word of package.json EXCEPT the two dependency lists themselves.
 *
 * `scripts` is where a CLI binary shows up (`vitest`, `chromatic`, `tsc`), but it is not the only
 * place: a package configures itself from its own key here - `lint-staged`, `husky`, `browserslist`,
 * `prettier`. Reading the whole file minus the dependency lists picks all of those up at once.
 *
 * The two lists have to come out, or every dependency would match its own name and the rule would
 * report nothing, ever.
 */
function tokensOutsideDependencyLists(sourceText, topLevelNode) {
  let text = sourceText
  for (const property of topLevelNode.properties) {
    const sectionName = property.key?.value ?? property.key?.name
    if (sectionName !== "dependencies" && sectionName !== "devDependencies") continue
    const [start, end] = property.range
    text = text.slice(0, start) + " ".repeat(end - start) + text.slice(end)
  }

  return new Set(text.match(IDENTIFIER_PATTERN) ?? [])
}

/**
 * The names a package declares as peer dependencies, read from its own installed manifest.
 *
 * A peer dependency is REQUIRED and never imported: `@tiptap/react` needs `@tiptap/pm` beside it,
 * `@stripe/react-stripe-js` needs `@stripe/stripe-js`, `@supabase/auth-ui-react` needs
 * `@supabase/auth-ui-shared`. Reporting those as unused is wrong - removing one breaks the package
 * that asked for it. So a peer of something already in use counts as used too.
 */
function peerDependenciesOf(repoRoot, name) {
  try {
    const manifestPath = path.join(repoRoot, "node_modules", name, "package.json")

    return Object.keys(JSON.parse(fs.readFileSync(manifestPath, "utf8")).peerDependencies ?? {})
  } catch {
    return []
  }
}

function isUsed(name, used, scriptWords) {
  if (used.importedPackages.has(name)) return true
  if (used.mentionedTokens.has(name) || scriptWords.has(name)) return true

  // `tsc` is typescript's binary, `storybook` covers @storybook/*, and a scoped package is often
  // named in a script by its last segment alone (`@storybook/addon-vitest` -> `storybook`).
  const lastSegment = name.includes("/") ? name.slice(name.indexOf("/") + 1) : name

  return scriptWords.has(lastSegment) || used.mentionedTokens.has(lastSegment)
}

module.exports = {
  "no-unused-dependencies": {
    meta: {
      type: "problem",
      docs: {
        description: "report a package.json dependency that no source, config, script or workflow mentions",
      },
      schema: [],
      messages: {
        unusedDependency:
          'package.json lists "{{name}}" and nothing in this repo mentions it - no import, no subpath ' +
          "import, no config file, no npm script, no CI workflow. Two ways to settle it, and only the " +
          "owner knows which: keep it if something outside this walk reads it (a Dockerfile, a deploy " +
          "script), or drop the line. Never removed automatically - `pnpm remove` re-resolves the " +
          'lockfile, and the "latest" pins in these repos have broken eslint that way before',
      },
    },

    create(context) {
      const filename = context.filename ?? context.getFilename()
      // The json processor hands eslint a virtual block named "<real path>/package.json/0.js", so the
      // basename here is 0.js rather than package.json. Both spellings are accepted.
      const marker = filename.lastIndexOf("package.json")
      if (marker === -1) return {}
      const packageJsonPath = filename.slice(0, marker + "package.json".length)

      return {
        ObjectExpression(node) {
          // only the top-level object - the added parens make it the sole ExpressionStatement
          if (node.parent?.type !== "ExpressionStatement") return

          let packageJson
          try {
            packageJson = JSON.parse(context.sourceCode.getText().replace(/^\s*\(|\)\s*$/g, ""))
          } catch {
            return
          }

          const repoRoot = path.dirname(packageJsonPath)
          const used = collectUsed(repoRoot)
          const otherWords = tokensOutsideDependencyLists(context.sourceCode.getText(), node)

          const declared = []
          for (const property of node.properties) {
            const sectionName = property.key?.value ?? property.key?.name
            if (sectionName !== "dependencies" && sectionName !== "devDependencies") continue
            if (property.value?.type !== "ObjectExpression") continue

            for (const dependency of property.value.properties) {
              const name = dependency.key?.value
              if (typeof name === "string") declared.push({ name, node: dependency })
            }
          }

          // A peer of something already in use is required, so it counts as used. Two passes are
          // enough in practice: a peer of a peer is rare and the second pass covers it.
          const requiredByPeer = new Set()
          for (let pass = 0; pass < 2; pass++) {
            for (const { name } of declared) {
              if (!isUsed(name, used, otherWords) && !requiredByPeer.has(name)) continue
              for (const peer of peerDependenciesOf(repoRoot, name)) requiredByPeer.add(peer)
            }
          }

          for (const { name, node: dependency } of declared) {
            if (isNeverReported(name)) continue
            if (isUsed(name, used, otherWords)) continue
            if (requiredByPeer.has(name)) continue

            context.report({
              loc: { start: dependency.loc.start, end: dependency.loc.end },
              messageId: "unusedDependency",
              data: { name },
            })
          }
        },
      }
    },
  },
}
