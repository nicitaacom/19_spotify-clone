"use strict"

const fs = require("fs")
const path = require("path")

// Why this rule exists: TypeScript's own NodeJS.ProcessEnv ships with an index signature
// ([key: string]: string | undefined), so process.env.ANYTHING type-checks whether or not env.d.ts
// declares it - declaring a name there only narrows string | undefined down to string, it never makes
// an undeclared name an error. That's the gap this rule fills: a name read as process.env.X somewhere
// in the app but never added to ProcessEnv compiles clean, ships, and silently reads undefined in an
// environment missing the value, with no signal anywhere until it breaks at runtime.
//
// This is the third leg of the env.d.ts / .env.example / app usage triangle - the other two sides are
// already covered: envs-order (vars-order.js) keeps env.d.ts and .env.example in sync with each other,
// no-defined-unused-envs (unused-declared-vars.js) flags an env.d.ts declaration nothing in the app
// reads. This rule flags the remaining direction: app usage with no env.d.ts declaration at all.
//
// A name counts as read on process.env.X member access only (dot notation, non-computed) - the same
// bare-name reasoning no-defined-unused-envs uses for the opposite check. process.env["X"] bracket
// access isn't used anywhere in this codebase's own conventions, so it's left unhandled rather than
// guessed at.
//
// NODE_ENV is the one hard-coded skip: it's Node's own ambient runtime variable, never declared in
// this project's env.d.ts (or in most projects' ProcessEnv augmentation at all), and flagging it would
// fire on nearly every file that branches on development vs production.

const SKIPPED_NAMES = new Set(["NODE_ENV"])
const DECLARATION_FILE = "env.d.ts"

// One entry per repo root, filled by the first lint of that repo and reused for the rest of the
// process - every other .ts/.tsx file asks the same question, so without this the rule would re-read
// and re-parse env.d.ts once per file linted instead of once per repo.
const declaredNamesByRepoRoot = new Map()

// Same walk-up as vars-order.js/unused-declared-vars.js - the nearest folder holding a package.json is
// the repo root, and env.d.ts sits directly in it.
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

// Every "IDENTIFIER: type" line inside the ProcessEnv interface is one declaration. Comments are
// stripped first, so a commented-out declaration counts for nothing.
//
// Read from disk, unlike the declaration side of envs-order/no-defined-unused-envs which read
// env.d.ts's own in-editor buffer when THAT file is the one being linted. Here the file being linted
// is always some OTHER .ts/.tsx file, so env.d.ts is never handed to us as source text - disk is the
// only source available, same tradeoff no-defined-unused-envs already accepts for reading every other
// source file.
function parseDeclaredNames(repoRoot) {
  const alreadyParsed = declaredNamesByRepoRoot.get(repoRoot)
  if (alreadyParsed !== undefined) return alreadyParsed

  const declaredNames = new Set()
  let text
  try {
    text = fs.readFileSync(path.join(repoRoot, DECLARATION_FILE), "utf8")
  } catch {
    declaredNamesByRepoRoot.set(repoRoot, declaredNames)
    return declaredNames
  }

  const lines = text.split("\n")
  const interfaceIndex = lines.findIndex(line => /\binterface\s+ProcessEnv\b/.test(line))
  if (interfaceIndex === -1) {
    declaredNamesByRepoRoot.set(repoRoot, declaredNames)
    return declaredNames
  }

  let depth = 0
  for (let index = interfaceIndex; index < lines.length; index++) {
    const withoutComment = lines[index].replace(/\/\/.*$/, "")
    if (withoutComment.includes("{")) depth += 1
    if (withoutComment.includes("}")) {
      depth -= 1
      if (depth <= 0) break
    }
    const match = /^\s*([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(withoutComment)
    if (match) declaredNames.add(match[1])
  }

  declaredNamesByRepoRoot.set(repoRoot, declaredNames)
  return declaredNames
}

module.exports = {
  "no-undefined-used-envs": {
    meta: {
      type: "problem",
      docs: {
        description: "report process.env.X read in app code where ProcessEnv (env.d.ts) has no declaration for X",
      },
      schema: [],
      messages: {
        undeclaredUsage:
          'process.env.{{name}} is read here but ProcessEnv has no declaration for "{{name}}" - TypeScript ' +
          "won't catch this on its own (ProcessEnv's index signature lets any name through as string | " +
          'undefined). Add "{{name}}: string" to env.d.ts, and a matching line to .env.example.',
      },
    },
    create(context) {
      const filename = context.filename ?? context.getFilename()
      if (path.basename(filename) === DECLARATION_FILE) return {}

      const repoRoot = findRepoRoot(filename)
      if (repoRoot === null) return {}

      return {
        "MemberExpression[object.object.name='process'][object.property.name='env']"(node) {
          if (node.computed || node.property.type !== "Identifier") return

          const name = node.property.name
          if (SKIPPED_NAMES.has(name)) return

          const declaredNames = parseDeclaredNames(repoRoot)
          if (declaredNames.has(name)) return

          context.report({ node, messageId: "undeclaredUsage", data: { name } })
        },
      }
    },
  },
}
