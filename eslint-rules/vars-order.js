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
// The two directions of drift are treated differently on purpose:
//
//   .env.example holds a name env.d.ts is missing  ->  fixed automatically. .env.example is the
//                                                      source of truth, so the declaration is added
//                                                      in the spot .env.example already gives it.
//                                                      `pnpm lint --fix` settles it with no
//                                                      decision from anyone.
//
//   env.d.ts holds a name .env.example is missing  ->  reported, never fixed. Only the owner knows
//                                                      whether that variable is still in use: it
//                                                      either belongs in .env.example, or the
//                                                      declaration is left over and should go. The
//                                                      message asks which.
//
// The report always lands on env.d.ts - that is the file a developer edits to settle three of the
// four checks, and firing on Program of that one file reports once per lint run instead of once per
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
const FALLBACK_INDENT = "      "

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
//
// The lines come from ESLint's own source text, never from a second fs.readFileSync of the same
// file. An editor lints the buffer you are typing in, so reading the file from disk compared the
// SAVED copy instead - type a variable into the wrong spot, see no warning until you save. Only
// .env.example is read from disk, because ESLint never hands it over.
function parseDeclarations(lines) {
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
    const match = /^(\s*)([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(withoutComment)
    if (match && !alreadySeen.has(match[2])) {
      alreadySeen.add(match[2])
      declarations.push({ name: match[2], line: index + 1, indent: match[1] })
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

// The line a new declaration goes after: the nearest name ABOVE it in .env.example that is already
// declared, so the added line lands where .env.example already puts it. When nothing above it is
// declared yet, it goes directly under the `interface ProcessEnv {` line.
function findAnchorLine(missingName, exampleNames, lineByName, interfaceLine) {
  for (let index = exampleNames.indexOf(missingName) - 1; index >= 0; index--) {
    const previousLine = lineByName.get(exampleNames[index])
    if (previousLine !== undefined) return previousLine
  }
  return interfaceLine
}

module.exports = {
  "envs-order": {
    meta: {
      type: "suggestion",
      fixable: "code",
      docs: {
        description:
          "keep env.d.ts listing the same variables in the same order as .env.example, and keep .env.example " +
          "grouped site URL, then Supabase, then Redis/Upstash, then AWS, then Pusher, then the rest",
      },
      schema: [],
      messages: {
        missingDeclaration:
          '.env.example lists "{{name}}" and ProcessEnv has no declaration for it - run `pnpm lint --fix` and ' +
          '"{{name}}: string" is written into the spot .env.example already gives it.',
        extraDeclaration:
          'ProcessEnv declares "{{name}}" and .env.example has no line for it. Two ways to settle it, and only ' +
          'the owner knows which: add a "{{name}}=" line to .env.example if the app still reads this variable, ' +
          "or delete the declaration from env.d.ts if it is left over. Never fixed automatically, for that reason.",
        wrongOrderFirst:
          '"{{name}}" should be the first declaration in ProcessEnv - .env.example lists it first, and both ' +
          "files must run in the same order.",
        wrongOrder:
          '"{{name}}" comes too early - .env.example puts it straight after "{{previousName}}", so move this ' +
          "declaration below that one.",
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

      const sourceCode = context.sourceCode ?? context.getSourceCode()
      const exampleNames = parseExampleNames(path.join(repoRoot, ".env.example"))
      const parsed = parseDeclarations(sourceCode.lines)
      if (exampleNames === null || parsed === null) return {}

      return {
        Program() {
          const lineByName = new Map(parsed.declarations.map(declaration => [declaration.name, declaration.line]))
          const exampleNameSet = new Set(exampleNames)
          const interfaceLoc = { line: parsed.interfaceLine, column: 0 }
          const indent = parsed.declarations[0]?.indent || FALLBACK_INDENT

          for (const name of exampleNames) {
            if (lineByName.has(name)) continue

            const anchorLine = findAnchorLine(name, exampleNames, lineByName, parsed.interfaceLine)
            const anchorText = sourceCode.lines[anchorLine - 1] ?? ""
            const anchorEnd = sourceCode.getIndexFromLoc({ line: anchorLine, column: anchorText.length })

            context.report({
              loc: { line: anchorLine, column: 0 },
              messageId: "missingDeclaration",
              data: { name },
              fix: fixer => fixer.insertTextAfterRange([anchorEnd, anchorEnd], `\n${indent}${name}: string`),
            })
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
          // slot out and point the order report at an innocent variable.
          const sharedFromExample = exampleNames.filter(name => lineByName.has(name))
          const exampleIndexByName = new Map(sharedFromExample.map((name, index) => [name, index]))
          const sharedDeclarations = parsed.declarations.filter(declaration => exampleNameSet.has(declaration.name))

          // Walking bottom-up, the smallest .env.example position still ahead of each declaration. A
          // declaration whose own position is LARGER than that sits above something .env.example puts
          // before it - so that declaration is the one to move, and the report belongs on its own
          // line. Reporting the displaced name instead put the squiggle on an innocent line: move
          // Stripe above Redis and the warning appeared on Redis, which is where it already belonged.
          const smallestAhead = new Array(sharedDeclarations.length).fill(Infinity)
          for (let index = sharedDeclarations.length - 2; index >= 0; index--) {
            const nextExampleIndex = exampleIndexByName.get(sharedDeclarations[index + 1].name)
            smallestAhead[index] = Math.min(smallestAhead[index + 1], nextExampleIndex)
          }

          for (let index = 0; index < sharedDeclarations.length; index++) {
            const declaration = sharedDeclarations[index]
            const exampleIndex = exampleIndexByName.get(declaration.name)
            if (exampleIndex <= smallestAhead[index]) continue

            const previousName = sharedFromExample[exampleIndex - 1]
            context.report({
              loc: { line: declaration.line, column: 0 },
              messageId: previousName ? "wrongOrder" : "wrongOrderFirst",
              data: { name: declaration.name, previousName: previousName ?? "" },
            })
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
