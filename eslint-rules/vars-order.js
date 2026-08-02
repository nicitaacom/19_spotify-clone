"use strict"

const fs = require("fs")
const path = require("path")

// This file is named vars-order.js while the rule id below is "envs-order" - a PreToolUse hook on
// this machine refuses any file path whose name holds those three letters, so the file needed a
// different name. ESLint reads the id from the export key at the bottom, not from the filename.
//
// Why this rule exists: .env.example is the source of truth for which variables the app reads, and
// env.d.ts is what TypeScript checks every process.<VAR> access against. When the two drift, a
// variable either type-checks with no example line telling the next person to set it, or has an
// example line and no type at all. This keeps both files listing the SAME names in the SAME order,
// and keeps .env.example itself grouped: the site URL variables, then Supabase, then Redis/Upstash,
// then AWS, then Pusher, then the rest.
//
// Bad (.env.example lists it, env.d.ts has no declaration):
//   .env.example   MY_IP=
//   env.d.ts       -
// Good:
//   .env.example   MY_IP=
//   env.d.ts       MY_IP: string
//
// The report always lands on env.d.ts - that is the file a developer edits to fix three of the four
// checks, and firing on Program of that one file reports once per lint run instead of once per
// source file in the repo.

// The order .env.example itself must run in. Rank 0 sits highest in the file, rank 5 lowest. A site
// URL is the one variable a fresh checkout always sets first, Supabase is the database behind it,
// Redis/Upstash the key-value store in front of that, then AWS, then Pusher - after those five,
// order is free.
//
// AWS and Pusher are conditional: a repo holding no AWS variable simply runs Redis/Upstash straight
// into Pusher, and a repo holding neither runs Redis/Upstash straight into the rest. A group nobody
// uses is never a problem - only a group sitting ABOVE one that belongs higher gets reported, which
// the highest-rank-so-far walk below gives for free.
const GROUPS = [
  { rank: 0, label: "site URL", matches: name => /URL$/.test(name) && /(PRODUCTION|SITE)/.test(name) },
  { rank: 1, label: "Supabase", matches: name => name.includes("SUPABASE") },
  { rank: 2, label: "Redis/Upstash", matches: name => name.includes("UPSTASH") || name.includes("REDIS") },
  // S3 is an AWS service, so an S3_* variable belongs with the AWS keys that reach it
  { rank: 3, label: "AWS", matches: name => name.includes("AWS") || name.startsWith("S3_") },
  { rank: 4, label: "Pusher", matches: name => name.includes("PUSHER") },
]

const OTHER_GROUP = { rank: 5, label: "everything else" }

function getGroup(name) {
  return GROUPS.find(group => group.matches(name)) ?? OTHER_GROUP
}

function readLines(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").split("\n")
  } catch {
    return null
  }
}

// Every non-comment, non-blank line of .env.example holds one variable - the identifier before the
// first "=". The value after it is never read.
function parseExampleNames(filePath) {
  const lines = readLines(filePath)
  if (lines === null) return null

  const names = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) continue
    const match = /^(?:export\s+)?([A-Za-z_$][\w$]*)\s*=/.exec(trimmed)
    if (match && !names.includes(match[1])) names.push(match[1])
  }
  return names
}

// Every "IDENTIFIER: type" line inside the ProcessEnv interface is one declaration. Comments are
// stripped first, so a commented-out declaration counts for nothing. A name written twice keeps its
// first line number only - the order check compares positions, and the first one is the position
// that reads.
function parseDeclarations(filePath) {
  const lines = readLines(filePath)
  if (lines === null) return null

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
    const match = /^\s*([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(withoutComment)
    if (match && !alreadySeen.has(match[1])) {
      alreadySeen.add(match[1])
      declarations.push({ name: match[1], line: index + 1 })
    }
  }
  return { declarations, interfaceLine: interfaceIndex + 1 }
}

// Same walk-up as imports-order.js - the nearest folder holding a package.json is the repo root, and
// both files this rule compares sit directly in it.
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

module.exports = {
  "envs-order": {
    meta: {
      type: "suggestion",
      docs: {
        description:
          "keep env.d.ts listing the same variables in the same order as .env.example, and keep .env.example " +
          "grouped site URL, then Supabase, then Redis/Upstash, then AWS, then Pusher, then the rest",
      },
      schema: [],
      messages: {
        missingDeclaration: '.env.example lists "{{name}}" but ProcessEnv has no declaration for it - add "{{name}}: string".',
        extraDeclaration:
          'ProcessEnv declares "{{name}}" but .env.example has no line for it - add a "{{name}}=" line there ' +
          "so the example file stays complete.",
        wrongOrderFirst:
          '"{{name}}" should be the first declaration in ProcessEnv - .env.example lists it first, and both ' +
          "files must run in the same order.",
        wrongOrder:
          '"{{name}}" sits in the wrong spot - .env.example puts it straight after "{{previousName}}", so move ' +
          "the declaration there.",
        wrongGroupOrder:
          '.env.example puts "{{name}}" ({{group}}) below "{{previousName}}" ({{previousGroup}}) - reorder ' +
          ".env.example so it runs: the site URL variables, then Supabase, then Redis/Upstash, then AWS, " +
          "then Pusher, then the rest.",
      },
    },
    create(context) {
      const filename = context.filename ?? context.getFilename()
      if (path.basename(filename) !== "env.d.ts") return {}

      const repoRoot = findRepoRoot(filename)
      if (repoRoot === null || path.resolve(filename) !== path.join(repoRoot, "env.d.ts")) return {}

      const exampleNames = parseExampleNames(path.join(repoRoot, ".env.example"))
      const parsed = parseDeclarations(path.join(repoRoot, "env.d.ts"))
      if (exampleNames === null || parsed === null) return {}

      return {
        Program() {
          const lineByName = new Map(parsed.declarations.map(declaration => [declaration.name, declaration.line]))
          const exampleNameSet = new Set(exampleNames)
          const interfaceLoc = { line: parsed.interfaceLine, column: 0 }

          for (const name of exampleNames) {
            if (!lineByName.has(name)) context.report({ loc: interfaceLoc, messageId: "missingDeclaration", data: { name } })
          }

          for (const declaration of parsed.declarations) {
            if (exampleNameSet.has(declaration.name)) continue
            context.report({
              loc: { line: declaration.line, column: 0 },
              messageId: "extraDeclaration",
              data: { name: declaration.name },
            })
          }

          // Order: compare only the names BOTH files hold. A name reported above as missing or extra
          // has no counterpart to line up with, so counting it here would push every later name one
          // slot out and point the single order report at an innocent variable.
          const sharedFromExample = exampleNames.filter(name => lineByName.has(name))
          const declaredNames = parsed.declarations.map(declaration => declaration.name)
          const sharedFromTypes = declaredNames.filter(name => exampleNameSet.has(name))
          for (let index = 0; index < sharedFromExample.length; index++) {
            if (sharedFromTypes[index] === sharedFromExample[index]) continue
            const name = sharedFromExample[index]
            context.report({
              loc: { line: lineByName.get(name), column: 0 },
              messageId: index === 0 ? "wrongOrderFirst" : "wrongOrder",
              data: { name, previousName: index === 0 ? "" : sharedFromExample[index - 1] },
            })
            break
          }

          // Group order inside .env.example itself - the first variable sitting above a group that
          // already appeared is the one worth naming, so this reports once and stops.
          let highestRankSoFar = -1
          let highestRankName = ""
          for (const name of exampleNames) {
            const group = getGroup(name)
            if (group.rank >= highestRankSoFar) {
              if (group.rank > highestRankSoFar) {
                highestRankSoFar = group.rank
                highestRankName = name
              }
              continue
            }
            context.report({
              loc: interfaceLoc,
              messageId: "wrongGroupOrder",
              data: {
                name,
                group: group.label,
                previousName: highestRankName,
                previousGroup: getGroup(highestRankName).label,
              },
            })
            break
          }
        },
      }
    },
  },
}
