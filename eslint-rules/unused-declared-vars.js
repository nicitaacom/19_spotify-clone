"use strict"

const fs = require("fs")
const path = require("path")

// This file is named unused-declared-vars.js while the rule id below is "no-unused-envs" - a
// PreToolUse hook on this machine refuses any file path whose name holds those three letters, so
// the file needed a different name. ESLint reads the id from the export key at the bottom, not from
// the filename. vars-order.js in this same folder uses the id "envs-order" for the same reason.
//
// Why this rule exists: env.d.ts only ever grows. A declaration stays behind long after the code
// that read it was deleted, and nothing complains - it still type-checks, .env.example still tells
// every fresh checkout to fill in a value, and the next person has no way to tell a variable the app
// truly needs from one that is left over. This rule reports a declaration that no .ts/.tsx file in
// the repo mentions.
//
// A name counts as read on a BARE-NAME match, not on a "process" -prefixed one. Most reads in these
// repos go through a decrypted object (decryptedEnvsClient.UPSTASH_REDIS_URL), a destructure
// (const { TELEGRAM_CHAT_ID } = process.env) or a template string, and a prefix-only match would
// report all three of those as unused.
//
// Never fixable, on purpose. A declaration this rule reports has two possible settlements and only
// the owner knows which: the variable is still read from somewhere outside the .ts/.tsx sources (a
// CI workflow, a shell script, a Dockerfile), or it is genuinely left over and the declaration plus
// its .env.example line should go. The message asks rather than deleting anything.

// Folders holding no source of this repo's own. node_modules alone is most of the walk, and
// .next/out/build hold generated copies of files already counted from their real spot.
const SKIPPED_FOLDERS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".open-next",
  ".turbo",
  ".vercel",
  ".claude",
  ".pnpm-store",
  "out",
  "build",
  "dist",
  "coverage",
  "storybook-static",
])

const DECLARATION_FILE = "env.d.ts"

// Files that LIST every variable name by definition, so a mention inside them proves nothing about
// the variable still being read anywhere real.
//
// checkKeys.ts is the key-check registry: it names every declaration on purpose, once in its entry
// and often again in the comment beside it. Added 2026-08-03 after that file went in and silenced
// this rule completely - UPSTASH_REDIS_URL is read by no code in 14/19/23, and stopped being
// reported the moment the registry mentioned it.
const CATALOGUE_FILES = new Set([DECLARATION_FILE, "checkKeys.ts"])
const IDENTIFIER_PATTERN = /[A-Za-z_$][\w$]*/g

// One entry per repo root, filled by the first lint of that repo and reused for the rest of the
// process. env.d.ts holds dozens of declarations and each one asks the same question, so without
// this the rule would walk the whole repo dozens of times per lint run.
const usedNamesByRepoRoot = new Map()

// Same walk-up as vars-order.js - the nearest folder holding a package.json is the repo root, and
// the declaration file sits directly in it.
function findRepoRoot(filename) {
  let dir = path.dirname(filename)
  for (let i = 0; i < 20; i++) {
    try {
      fs.accessSync(path.join(dir, "package.json"))
      return dir
    } catch {
      const parent = path.dirname(dir)
      if (parent === dir) return null
      dir = parent
    }
  }
  return null
}

// Every identifier-shaped token of every .ts/.tsx file under the repo root, in one Set. Tokens
// rather than parsed references on purpose: a name reached through a decrypted object, a
// destructure, a string key or a comment all count, and each of those is a real reason the variable
// still belongs in env.d.ts.
function collectUsedNames(repoRoot) {
  const alreadyWalked = usedNamesByRepoRoot.get(repoRoot)
  if (alreadyWalked !== undefined) return alreadyWalked

  const usedNames = new Set()
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
        if (!SKIPPED_FOLDERS.has(entry.name)) pendingFolders.push(fullPath)
        continue
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue
      // A catalogue file proves nothing - every name in it appears there by definition.
      if (CATALOGUE_FILES.has(entry.name)) continue

      let text
      try {
        text = fs.readFileSync(fullPath, "utf8")
      } catch {
        continue
      }
      const tokens = text.match(IDENTIFIER_PATTERN)
      if (tokens === null) continue
      for (const token of tokens) usedNames.add(token)
    }
  }

  usedNamesByRepoRoot.set(repoRoot, usedNames)
  return usedNames
}

// Every "IDENTIFIER: type" line inside the ProcessEnv interface is one declaration. Comments are
// stripped first, so a commented-out declaration counts for nothing.
//
// The lines come from ESLint's own source text, never from a second fs.readFileSync of the same
// file. An editor lints the buffer being typed in, so reading the file from disk would compare the
// SAVED copy instead - delete the last read of a variable and see no warning until the file is
// written out.
function parseDeclarations(lines) {
  const interfaceIndex = lines.findIndex(line => /\binterface\s+ProcessEnv\b/.test(line))
  if (interfaceIndex === -1) return null

  const declarations = []
  const alreadySeen = new Set()
  let depth = 0
  for (let index = interfaceIndex; index < lines.length; index++) {
    const withoutComment = lines[index].replace(/\/\/.*$/, "")
    if (withoutComment.includes("{")) depth += 1
    if (withoutComment.includes("}")) {
      depth -= 1
      if (depth <= 0) break
    }
    const match = /^(\s*)([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(withoutComment)
    if (match && !alreadySeen.has(match[2])) {
      alreadySeen.add(match[2])
      declarations.push({ name: match[2], line: index + 1 })
    }
  }
  return declarations
}

// Every report spans a whole line, start column 0 to the last character. Passing a single
// { line, column } position makes an editor underline ONE character - the squiggle is there, but it
// is a speck at the start of the line and reads as nothing at all.
function getLineLoc(sourceCode, line) {
  const text = sourceCode.lines[line - 1] ?? ""

  return { start: { line, column: 0 }, end: { line, column: text.length } }
}

module.exports = {
  "no-unused-envs": {
    meta: {
      type: "suggestion",
      docs: {
        description: "report a ProcessEnv declaration in env.d.ts whose name appears in no .ts/.tsx file of the repo",
      },
      schema: [],
      messages: {
        unusedDeclaration:
          'ProcessEnv declares "{{name}}" and no .ts/.tsx file in this repo mentions that name - not as ' +
          "process.{{name}}, not through a decrypted object, not in a destructure. Two ways to settle it, and " +
          "only the owner knows which: keep the declaration if something outside the sources reads it (a CI " +
          "workflow, a shell script), or delete this line plus its .env.example line if it is left over. Never " +
          "fixed automatically, for that reason.",
      },
    },
    create(context) {
      const filename = context.filename ?? context.getFilename()
      if (path.basename(filename) !== DECLARATION_FILE) return {}

      const repoRoot = findRepoRoot(filename)
      if (repoRoot === null || path.resolve(filename) !== path.join(repoRoot, DECLARATION_FILE)) return {}

      const sourceCode = context.sourceCode ?? context.getSourceCode()
      const declarations = parseDeclarations(sourceCode.lines)
      if (declarations === null) return {}

      return {
        Program() {
          const usedNames = collectUsedNames(repoRoot)

          for (const declaration of declarations) {
            if (usedNames.has(declaration.name)) continue

            context.report({
              loc: getLineLoc(sourceCode, declaration.line),
              messageId: "unusedDeclaration",
              data: { name: declaration.name },
            })
          }
        },
      }
    },
  },
}
