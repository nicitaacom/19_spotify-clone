"use strict"

// dev_readme-eslint.md's "General code style" #3 - "Prefer early returns" - was documented but not
// enforced. This catches the one safe, mechanical shape of that: a function whose LAST statement is
// a lone `if` (no `else`) wrapping the rest of the function's logic. Inverting the condition and
// returning early flattens that nesting without changing behavior, since nothing follows the `if` to
// lose - the function already implicitly returned `undefined` past this point either way.
// Wrong:
//   function handleClick() {
//     if (isOpen) {
//       doSomethingA()
//       doSomethingB()
//     }
//   }
// Correct:
//   function handleClick() {
//     if (!isOpen) return
//
//     doSomethingA()
//     doSomethingB()
//   }
//
// Deliberately conservative, same philosophy as prefer-ternary.js: bails (no report) the moment the
// shape isn't provably safe to invert -
//   - only the direct body of a function (FunctionDeclaration/FunctionExpression/
//     ArrowFunctionExpression) qualifies - an `if` nested inside a loop/another block is left alone,
//     since `return` there would exit the whole function, not just skip that inner block (a
//     `for`/`while` iteration needs `continue`, not `return` - different statement, different rule)
//   - an `if/else` is a real 2-way branch already, not something "early return" applies to
//   - a consequent that's already just `return`/`throw`/`continue`/`break` is already the shortest
//     possible form - nothing to flatten
//   - a `typeof window === "undefined"` check (either operand order, `===`/`!==`, alone or inside a
//     `&&`/`||`/`!`) is left untouched no matter its shape - this project's SSR guard idiom is
//     written both ways on purpose and isn't this rule's concern
//   - the fixer only runs when every line of the consequent's body can be dedented by exactly one
//     indent step (same indent character/width the `if` itself already uses) - anything reformatted
//     in a way that breaks that assumption is reported without an autofix, never guessed at
//   - the consequent has to span MORE than 5 lines - Nikita's own read on the real output (a 1-2
//     line consequent like `if (error) { setMountingStep(...); toast.show(...) }` isn't worth the
//     diff noise; a 9-line one like useProcessedNumbers.ts's original body clearly is)
//
// Negating the test itself follows Nikita's own call (2026-08-16, reacting to real output like
// `if (!(now - warnedAt >= WARN_WINDOW_MS)) return`):
//   - `===`/`!==`/`==`/`!=` flip to their opposite - always exactly equivalent, no edge case
//   - `<`/`>`/`<=`/`>=` ALSO flip to their opposite (`<` <-> `>=`, `>` <-> `<=`) - his explicit
//     instruction, overriding this rule's earlier NaN-safety caution (`!(a < b)` and `a >= b`
//     disagree when a real NaN operand is in play). Timestamps/lengths/counts, this codebase's
//     actual comparison operands, are never NaN in practice - a real risk on paper, not one worth
//     keeping the uglier `!(...)` form for
//   - a `&&`/`||` chain gets NO autofix at all - report only. His correction (2026-08-16) after
//     seeing the first version's output: naming `a && b && c` as one combined `condition` hides
//     what each piece actually checks (and worse, invites a wrong guess at a name - his own sketch
//     fix mislabeled `length > 0` as "isEmpty"). Splitting a chain into one well-named const PER
//     OPERAND (`const isEnterKey = ...`, `const hasLabelName = ...`, one line each) is a naming
//     call this rule has no domain knowledge to make safely - flag it, let a human name each piece
//   - anything else with no clean bare-`!expr` negation and NOT a `&&`/`||` chain (a ternary used
//     as a test, a TS assertion, ...) - nothing to split, so it gets NAMED instead of wrapped:
//     `const condition = expr` then `if (!condition) return`. Bails the autofix (report only) if
//     `condition` is already used anywhere in the file - never shadows a real binding

const { getIndentString } = require("../utils/lineWidth")

const FUNCTION_NODE_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"])
const ALREADY_SHORTEST_TYPES = new Set(["ReturnStatement", "ThrowStatement", "ContinueStatement", "BreakStatement"])
const EQUALITY_FLIP = { "===": "!==", "!==": "===", "==": "!=", "!=": "==" }
const ORDERING_FLIP = { "<": ">=", ">": "<=", "<=": ">", ">=": "<" }
const MIN_CONSEQUENT_LINES_TO_REPORT = 5
const EXTRACTED_CONDITION_NAME = "condition"

// Everything here binds at least as tightly as unary `!` itself, so prefixing with a bare `!` never
// changes what it applies to - no parens needed. Deliberately excludes ConditionalExpression (`?:`
// binds looser than `!`, so `!a ? b : c` would silently negate only `a`) and any TS assertion
// (`as`/`<T>x` binds looser too) - those fall through to the `!(...)` wrap below instead.
const NEGATE_WITHOUT_PARENS_TYPES = new Set([
  "Identifier",
  "Literal",
  "MemberExpression",
  "CallExpression",
  "NewExpression",
  "ThisExpression",
  "ArrayExpression",
  "ObjectExpression",
  "ChainExpression",
  "TemplateLiteral",
  "TaggedTemplateExpression",
  "UnaryExpression",
  "AwaitExpression",
  "TSNonNullExpression",
])

function isTypeofWindow(node) {
  return (
    node.type === "UnaryExpression" &&
    node.operator === "typeof" &&
    node.argument.type === "Identifier" &&
    node.argument.name === "window"
  )
}

function isUndefinedLiteral(node) {
  return (node.type === "Literal" && node.value === "undefined") || (node.type === "Identifier" && node.name === "undefined")
}

function isWindowUndefinedComparison(node) {
  if (node.type !== "BinaryExpression") return false
  if (node.operator !== "===" && node.operator !== "!==") return false
  return (
    (isTypeofWindow(node.left) && isUndefinedLiteral(node.right)) ||
    (isTypeofWindow(node.right) && isUndefinedLiteral(node.left))
  )
}

// Walks Logical/Unary wrappers so `typeof window === "undefined" || somethingElse` still counts -
// the exception is about the CHECK being present anywhere in the test, not about the test being
// exactly that one comparison.
function containsWindowUndefinedCheck(node) {
  if (!node) return false
  if (isWindowUndefinedComparison(node)) return true
  if (node.type === "LogicalExpression") return containsWindowUndefinedCheck(node.left) || containsWindowUndefinedCheck(node.right)
  if (node.type === "UnaryExpression" && node.operator === "!") return containsWindowUndefinedCheck(node.argument)
  return false
}

// Returns one of:
//   { kind: "expr", text }    - negates cleanly to a single expression, no wrapping parens needed
//   { kind: "extract", text } - nothing to split; the fixer names the whole test as one const
//   { kind: "manual" }        - a &&/|| chain - report only, no autofix (see file header)
function buildNegation(sourceCode, test) {
  if (test.type === "UnaryExpression" && test.operator === "!") {
    return { kind: "expr", text: sourceCode.getText(test.argument) }
  }
  if (test.type === "BinaryExpression" && EQUALITY_FLIP[test.operator]) {
    return { kind: "expr", text: `${sourceCode.getText(test.left)} ${EQUALITY_FLIP[test.operator]} ${sourceCode.getText(test.right)}` }
  }
  if (test.type === "BinaryExpression" && ORDERING_FLIP[test.operator]) {
    return { kind: "expr", text: `${sourceCode.getText(test.left)} ${ORDERING_FLIP[test.operator]} ${sourceCode.getText(test.right)}` }
  }
  if (NEGATE_WITHOUT_PARENS_TYPES.has(test.type)) return { kind: "expr", text: `!${sourceCode.getText(test)}` }
  if (test.type === "LogicalExpression") return { kind: "manual" }
  return { kind: "extract", text: sourceCode.getText(test) }
}

function conditionNameIsFree(sourceCode) {
  return !new RegExp(`\\b${EXTRACTED_CONDITION_NAME}\\b`).test(sourceCode.getText())
}

// Dedents the consequent's statements by exactly one indent step (the gap between the `if`'s own
// indent and its first statement's indent), preserving every inner line, comment and blank line
// as-is otherwise. Returns null the moment a line doesn't have the expected indent prefix - a
// hand-reflowed block is left for a human, never guessed at.
function buildDedentedBody(sourceCode, ifNode, consequentBody) {
  const firstStatement = consequentBody[0]
  const lastStatement = consequentBody[consequentBody.length - 1]
  const ifIndent = getIndentString(sourceCode, ifNode)
  const firstStatementIndent = getIndentString(sourceCode, firstStatement)
  if (!firstStatementIndent.startsWith(ifIndent) || firstStatementIndent.length <= ifIndent.length) return null

  const stepText = firstStatementIndent.slice(ifIndent.length)
  const startOfFirstLine = sourceCode.getIndexFromLoc({ line: firstStatement.loc.start.line, column: 0 })
  const rawText = sourceCode.text.slice(startOfFirstLine, lastStatement.range[1])

  const dedentedLines = []
  for (const line of rawText.split("\n")) {
    if (line.trim() === "") {
      dedentedLines.push("")
      continue
    }
    if (!line.startsWith(stepText)) return null
    dedentedLines.push(line.slice(stepText.length))
  }
  return dedentedLines.join("\n")
}

module.exports = {
  "prefer-early-return": {
    meta: {
      type: "suggestion",
      fixable: "code",
      docs: {
        description:
          "an if with no else, as the last statement in a function body, wrapping more than 5 lines of the function - invert the condition and return early instead",
      },
      schema: [],
      messages: {
        preferEarlyReturn: "Invert this condition and return early instead of wrapping the rest of the function in `if`.",
        preferEarlyReturnLogical:
          "Invert this condition and return early instead of wrapping the rest of the function in `if`. Name each &&/|| operand as its own const first (e.g. `const isEnterKey = ...`) - no autofix here, a combined name has no safe guess.",
      },
    },
    create(context) {
      const sourceCode = context.sourceCode ?? context.getSourceCode()

      return {
        IfStatement(node) {
          if (node.alternate) return

          const block = node.parent
          if (!block || block.type !== "BlockStatement") return
          if (!block.parent || !FUNCTION_NODE_TYPES.has(block.parent.type)) return
          if (block.body[block.body.length - 1] !== node) return

          if (node.consequent.type !== "BlockStatement") return
          const consequentBody = node.consequent.body.filter(statement => statement.type !== "EmptyStatement")
          if (consequentBody.length === 0) return
          if (consequentBody.length === 1 && ALREADY_SHORTEST_TYPES.has(consequentBody[0].type)) return

          if (containsWindowUndefinedCheck(node.test)) return

          const consequentLineCount =
            consequentBody[consequentBody.length - 1].loc.end.line - consequentBody[0].loc.start.line + 1
          if (consequentLineCount <= MIN_CONSEQUENT_LINES_TO_REPORT) return

          const negation = buildNegation(sourceCode, node.test)

          if (negation.kind === "manual") {
            context.report({ node, messageId: "preferEarlyReturnLogical" })
            return
          }

          context.report({
            node,
            messageId: "preferEarlyReturn",
            fix(fixer) {
              const dedentedBody = buildDedentedBody(sourceCode, node, consequentBody)
              if (dedentedBody === null) return null

              if (negation.kind === "expr") {
                return fixer.replaceText(node, `if (${negation.text}) return\n\n${dedentedBody}`)
              }

              if (!conditionNameIsFree(sourceCode)) return null
              const indent = getIndentString(sourceCode, node)
              return fixer.replaceText(
                node,
                `const ${EXTRACTED_CONDITION_NAME} = ${negation.text}\n${indent}if (!${EXTRACTED_CONDITION_NAME}) return\n\n${dedentedBody}`,
              )
            },
          })
        },
      }
    },
  },
}
