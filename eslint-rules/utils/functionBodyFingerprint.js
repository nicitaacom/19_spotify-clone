"use strict"

const { namePairSignals, NAME_DIST_MAX } = require("./duplicateNameSignals")

// Scope-based canonicalization + shingle/containment similarity for cross-file "near-duplicate
// logic" detection (no-duplicate-export-hard). Two functions only look similar here if they touch
// the SAME external names (imports, captured outer names, props, property/member names) in the SAME
// structural shape - only their OWN local parameters/variables get replaced with generic
// placeholders, which is the main false-positive guard (two unrelated functions calling different
// things never accumulate matching shingles just because they're both "a guard clause + a call").

// Counts non-blank, non-comment-only lines strictly between a block's braces - same technique as
// no-tiny-hook-file.js's own countRealBodyLines, reused here as the "too small to compare
// meaningfully" gate (MIN_BODY_LINES lives in the rule file, this just does the counting).
// blockNode.loc holds the two line numbers the parser already computed. getLocFromIndex(range) asks
// for the identical pair but THROWS a RangeError when the index lands past the end of the source text,
// and a rule that throws aborts the ENTIRE eslint run with exit 2 - which takes `pnpm build` down with
// it, since build runs `eslint . --max-warnings=-1` first. Hit for real on handleDeleteEmail.ts
// ("requested index 37691, but source text has length 37686") while a second eslint --fix was
// rewriting the same files. Reading loc directly removes the whole failure class.
function countRealBodyLines(sourceCode, blockNode) {
  const startLine = blockNode.loc.start.line
  const endLine = blockNode.loc.end.line
  const comments = sourceCode.getCommentsInside(blockNode)
  const commentLines = new Set()
  for (const comment of comments) {
    for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) commentLines.add(line)
  }

  let count = 0
  for (let line = startLine + 1; line < endLine; line++) {
    const text = sourceCode.lines[line - 1]?.trim() ?? ""
    if (!text) continue
    if (commentLines.has(line) && !/[;)}=]/.test(text)) continue
    count++
  }
  return count
}

function collectScopes(scope, out) {
  out.push(scope)
  for (const child of scope.childScopes) collectScopes(child, out)
}

// A local PARAM/VAR is anything declared INSIDE this function's own scope tree (its own params,
// let/const/var, catch/loop bindings, and the same for every NESTED function - e.g. the `results`
// parameter of a `complete: results => {...}` callback passed to Papa.parse is still local to the
// outer exported function for this purpose). Two role buckets, not positional numbering - a
// positionally-numbered scheme (L1, L2, ...) breaks alignment the moment one function has an extra
// local statement the other doesn't (exactly the CSV motivating case: one version has an extra
// `setError("")` line before the shared Papa.parse call).
function buildLocalClassification(functionScope) {
  const scopes = []
  collectScopes(functionScope, scopes)

  const classificationByRangeStart = new Map()
  for (const scope of scopes) {
    for (const variable of scope.variables) {
      if (variable.name === "arguments" || variable.defs.length === 0) continue
      const bucket = variable.defs[0].type === "Parameter" ? "PARAM" : "VAR"
      for (const idNode of variable.identifiers) classificationByRangeStart.set(idNode.range[0], bucket)
      for (const ref of variable.references) classificationByRangeStart.set(ref.identifier.range[0], bucket)
    }
  }
  return classificationByRangeStart
}

// Every top-level JSXElement/JSXFragment reached anywhere in the body (not just a direct return -
// also a ternary branch, a variable holding JSX, etc.) collapses to ONE opaque token and is never
// descended into - markup itself is never compared, only the logic around it. Avoids a likely-large
// false-positive source in a Tailwind-heavy codebase (two unrelated components sharing generic
// `<div className=...>` skeletons would otherwise look artificially similar).
function collectJsxRanges(node, out) {
  if (!node || typeof node.type !== "string") return
  if (node.type === "JSXElement" || node.type === "JSXFragment") {
    out.push(node.range)
    return
  }
  for (const key in node) {
    if (key === "parent") continue
    const value = node[key]
    if (Array.isArray(value)) value.forEach(child => collectJsxRanges(child, out))
    else if (value && typeof value.type === "string") collectJsxRanges(value, out)
  }
}

function classifyToken(token, classificationByRangeStart) {
  if (token.type === "Identifier") return classificationByRangeStart.get(token.range[0]) ?? token.value
  if (token.type === "String" || token.type === "Template") return "STR"
  if (token.type === "Numeric") return "NUM"
  if (token.type === "Boolean") return "BOOL"
  if (token.type === "RegularExpression") return "REGEX"
  // Keywords/punctuation/operators (if, return, {, }, :, =>, ===, ...) kept as real text - this is
  // the structural skeleton the similarity score is actually measuring.
  return token.value
}

// getScope(functionNode) - passed in by the caller rather than resolved here, since the
// sourceCode.getScope / context.getScope compat fallback is a per-rule concern (see
// no-throwaway-alias.js's own use of the same fallback), not this util's.
function canonicalizeFunctionBody(functionNode, sourceCode, getScope) {
  const functionScope = getScope(functionNode)
  const classificationByRangeStart = buildLocalClassification(functionScope)

  const jsxRanges = []
  collectJsxRanges(functionNode.body, jsxRanges)
  jsxRanges.sort((a, b) => a[0] - b[0])

  const tokens = sourceCode.getTokens(functionNode.body)
  const canonical = []
  let activeJsxRangeEnd = null

  for (const token of tokens) {
    if (activeJsxRangeEnd !== null) {
      if (token.range[0] < activeJsxRangeEnd) continue
      activeJsxRangeEnd = null
    }

    const enteredRange = jsxRanges.find(range => token.range[0] >= range[0] && token.range[0] < range[1])
    if (enteredRange) {
      canonical.push("JSX_RETURN")
      activeJsxRangeEnd = enteredRange[1]
      continue
    }

    canonical.push(classifyToken(token, classificationByRangeStart))
  }

  return canonical
}

// 5-token sliding window - small enough that one inserted/removed statement only breaks the ~5
// shingles overlapping it (the rest of a shared run still matches), large enough that trivial
// 2-3 token idioms shared by huge numbers of unrelated functions ("} if (", "PARAM . VAR") don't
// dominate the comparison.
const SHINGLE_SIZE = 5

function buildShingles(canonicalTokens) {
  const shingles = new Set()
  for (let i = 0; i + SHINGLE_SIZE <= canonicalTokens.length; i++) {
    shingles.add(canonicalTokens.slice(i, i + SHINGLE_SIZE).join(""))
  }
  return shingles
}

// Containment (Szymkiewicz-Simpson), not Dice/Jaccard - normalizes by the SMALLER function's own
// shingle count, so "what fraction of the smaller function's structure also appears in the other"
// is answered directly. A 45-line function sharing a short setup block with a 10-line function
// scores low under Jaccard/Dice (dominated by the larger function's unrelated bulk) but scores
// correctly here. When both functions are similar size this converges toward what Dice would give
// anyway - one formula covers both the partial-overlap case and the whole-body-clone case.
function containment(shinglesA, shinglesB) {
  if (shinglesA.size === 0 || shinglesB.size === 0) return { ratio: 0, intersectionSize: 0 }
  const [smaller, larger] = shinglesA.size <= shinglesB.size ? [shinglesA, shinglesB] : [shinglesB, shinglesA]
  let intersectionSize = 0
  for (const shingle of smaller) if (larger.has(shingle)) intersectionSize++
  return { ratio: intersectionSize / smaller.size, intersectionSize }
}

// ---- two-lane matching thresholds ----
// Calibrated against a full-repo scan (2026-07-17, 1771 entities incl. nested functions): a single
// containment threshold could not separate accidental duplication from this repo's own deliberate
// parallel families (0.6 -> 0 hits, 0.4 -> 856 hits with a smooth score curve and no cliff).
// Two corroborated lanes replace it - convergent evolution (same conventions force the same shape:
// updateDBXxxAction, useXxxHandlers, POST route bodies) is filtered out, common descent (actually
// copied code) is kept. Result on the calibration scan: 20 unique file pairs, every known real
// duplicate included, every known deliberate family excluded.
//
// LANE "name" - near-identical name corroborates the body overlap:
//   - same word multiset under a different order/casing (handleUploadCSV vs handleCsvUpload), or a
//     1-2 char spelling difference (decryptEPT vs decryptEPRT), never a digits-only difference
//     (updateV_0_6_12 family) and never a different FIRST word (get/set, POST/PUT, accept/decline
//     are deliberate counterparts) - with that name evidence, 35% body containment suffices (the
//     CSV motivating case measures 46%).
//   - an IDENTICAL key needs the pair to involve a nested function (export-vs-export identity is
//     no-duplicate-export-easy's turf) and a 70% body bar - this repo's naming conventions make
//     same-named handlers (handleDelete, handleSubmit) converge legitimately below that
//     (measured: convergent same-name pairs sit at 46-57%, copied ones at 73-100%).
const CONTAINMENT_NAME_CORROBORATED = 0.35
const CONTAINMENT_IDENTICAL_NAME = 0.7
//
// LANE "block" - no name evidence, so the body must prove literal copying on its own: high
// containment of the smaller body (>= 0.7) in a clearly larger one (size ratio <= 0.6 - two
// similar-sized peers matching this hard are a deliberate parallel family, measured), a large
// shared-shingle mass (>= 40), and decisively: an UNBROKEN identical canonical-token run of >= 90
// tokens (~a 12+ line block copied verbatim). Measured separation: real copies score 96-310
// (Emails' inline copy of useDedupedSetEmails: 110), shared per-file boilerplate (redis/supabase
// client setup) and convention echoes top out at 87.
const CONTAINMENT_COPIED_BLOCK = 0.7
const COPIED_BLOCK_MIN_SHARED_SHINGLES = 40
const COPIED_BLOCK_MAX_SIZE_RATIO = 0.6
const MIN_IDENTICAL_TOKEN_RUN = 90

const MIN_SHARED_SHINGLES = 8
// Cheap pre-filter before the exact containment computation - a real match needs at least this
// many shared shingles just to be worth the exact check.
const CANDIDATE_SHARED_SHINGLE_FLOOR = 3
// Stop-shingle pruning (standard token-based clone-detection technique, e.g. MOSS/JPlag) - once a
// shingle is common enough across the registry it stops being useful for candidate generation
// (still counts toward the exact containment math for any candidate found via other shingles).
const STOP_SHINGLE_DOC_FREQ_CAP = 50
const STOP_SHINGLE_DOC_FREQ_RATIO = 0.05

// Built incrementally off each file's OWN AST as ESLint naturally lints it - never a second
// full-repo parse pass (no-solo-importer.js's own comment states that would cost more than the
// lint run itself, same constraint applies here). Cached per appRoot, process-lifetime, same shape
// as every other repo-wide cache in this rule set.
//
// Accepted trade-off: this only gives full, order-independent coverage on a from-scratch
// whole-repo `eslint .` run in one process. A file linted EARLY in the run's file order won't see
// duplicates that only appear in files linted LATER - only later files benefit from everything
// indexed before them. Same asymmetry class as any incremental single-process cache.
const bodyRegistryByAppRoot = new Map()

function getBodyRegistry(appRoot) {
  if (bodyRegistryByAppRoot.has(appRoot)) return bodyRegistryByAppRoot.get(appRoot)
  const registry = { entries: new Map(), invertedIndex: new Map(), shingleDocFreq: new Map(), nextId: 0 }
  bodyRegistryByAppRoot.set(appRoot, registry)
  return registry
}

function isStopShingle(registry, shingle) {
  const freq = registry.shingleDocFreq.get(shingle) ?? 0
  if (freq > STOP_SHINGLE_DOC_FREQ_CAP) return true
  return registry.entries.size > 20 && freq / registry.entries.size > STOP_SHINGLE_DOC_FREQ_RATIO
}

// Longest UNBROKEN run of identical canonical tokens between two bodies - shingle sets already
// measure how MUCH structure is shared, this measures whether it is shared in one contiguous
// copied block (common descent) or scattered across many small idiom fragments (convergent
// evolution). Standard rolling-row DP, only ever computed for the few pairs per run that pass
// every cheaper copied-block gate first.
function longestCommonTokenRun(tokensA, tokensB) {
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA]
  let previousRow = new Int32Array(shorter.length + 1)
  let currentRow = new Int32Array(shorter.length + 1)
  let best = 0
  for (let i = 1; i <= longer.length; i++) {
    const longerToken = longer[i - 1]
    for (let j = 1; j <= shorter.length; j++) {
      if (longerToken === shorter[j - 1]) {
        const runLength = previousRow[j - 1] + 1
        currentRow[j] = runLength
        if (runLength > best) best = runLength
      } else currentRow[j] = 0
    }
    ;[previousRow, currentRow] = [currentRow, previousRow]
  }
  return best
}

// null when the pair passes neither lane - see the threshold block above for what each lane means.
function checkLanes(queryEntry, candidateEntry, ratio, intersectionSize) {
  const signals = namePairSignals(queryEntry.profile, candidateEntry.profile)

  if (signals.identicalKey) {
    const bothExports = queryEntry.level === "export" && candidateEntry.level === "export"
    if (!bothExports && ratio >= CONTAINMENT_IDENTICAL_NAME) return { lane: "name" }
  } else if (
    !signals.digitFamily &&
    signals.sameFirstWord &&
    (signals.wordsEqual || signals.nameDist <= NAME_DIST_MAX) &&
    ratio >= CONTAINMENT_NAME_CORROBORATED
  ) {
    return { lane: "name" }
  }

  if (ratio < CONTAINMENT_COPIED_BLOCK || intersectionSize < COPIED_BLOCK_MIN_SHARED_SHINGLES) return null
  const smaller = Math.min(queryEntry.shingles.size, candidateEntry.shingles.size)
  const larger = Math.max(queryEntry.shingles.size, candidateEntry.shingles.size)
  if (smaller / larger > COPIED_BLOCK_MAX_SIZE_RATIO) return null
  if (signals.digitFamily || signals.contrastSlot) return null
  const runLength = longestCommonTokenRun(queryEntry.tokens, candidateEntry.tokens)
  if (runLength < MIN_IDENTICAL_TOKEN_RUN) return null
  return { lane: "block", runLength }
}

function findBestMatch(registry, queryEntry) {
  const candidateCounts = new Map()
  for (const shingle of queryEntry.shingles) {
    if (isStopShingle(registry, shingle)) continue
    const entryIds = registry.invertedIndex.get(shingle)
    if (!entryIds) continue
    for (const entryId of entryIds) candidateCounts.set(entryId, (candidateCounts.get(entryId) ?? 0) + 1)
  }

  let best = null
  for (const [entryId, sharedCount] of candidateCounts) {
    if (sharedCount < CANDIDATE_SHARED_SHINGLE_FLOOR) continue
    const entry = registry.entries.get(entryId)
    if (!entry || entry.file === queryEntry.file) continue
    const { ratio, intersectionSize } = containment(queryEntry.shingles, entry.shingles)
    if (intersectionSize < MIN_SHARED_SHINGLES) continue
    if (best && ratio <= best.ratio) continue
    const laneResult = checkLanes(queryEntry, entry, ratio, intersectionSize)
    if (!laneResult) continue
    best = { entry, ratio, intersectionSize, ...laneResult }
  }
  return best
}

function insertEntry(registry, entry) {
  const id = registry.nextId++
  registry.entries.set(id, entry)
  for (const shingle of entry.shingles) {
    if (!registry.invertedIndex.has(shingle)) registry.invertedIndex.set(shingle, new Set())
    registry.invertedIndex.get(shingle).add(id)
    registry.shingleDocFreq.set(shingle, (registry.shingleDocFreq.get(shingle) ?? 0) + 1)
  }
}

// Query FIRST, insert AFTER - a file never matches itself, and every later-linted file can find
// everything indexed before it (see the accepted trade-off note above getBodyRegistry).
function queryAndInsert(appRoot, entry) {
  const registry = getBodyRegistry(appRoot)
  const best = findBestMatch(registry, entry)
  insertEntry(registry, entry)
  return best
}

module.exports = { countRealBodyLines, canonicalizeFunctionBody, buildShingles, queryAndInsert }
