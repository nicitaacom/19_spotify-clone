"use strict"

// 👎 Bad - a ? : inside a ? : inside a ? : . The same value is rebuilt at every branch:
//   🔻
//   raw === false
//     ? false
//     : Array.isArray(raw)
//       ? raw.filter(keepEmail)
//       : typeof raw === "string"
//         ? raw ? [raw] : []
//         : null
// 👍 Good - each check is its own one-line arrow, then one const per branch:
//   const isFalseReply = (value: unknown): value is false => value === false
//   const replyWhenFalse = isFalseReply(raw) ? false : undefined
//   const replyWhenList = isEmailList(raw) ? raw.filter(keepEmail) : undefined
//   const replyToList = replyWhenFalse ?? replyWhenList ?? null
//
// Two levels stay quiet: `open ? (ready ? "go" : "wait") : "closed"`.
// A ? : written in JSX stays quiet - that is layout, not this value ladder.
// A ? : inside a function argument stays its own expression.

const MAX_NESTED_CONDITIONS = 3

const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"])

function nestedConditionDepth(node) {
  if (!node || typeof node.type !== "string") return 0
  if (FUNCTION_TYPES.has(node.type)) return 0
  if (node.type === "JSXElement" || node.type === "JSXFragment") return 0
  const here = node.type === "ConditionalExpression" ? 1 : 0
  let nested = 0
  for (const key of Object.keys(node)) {
    if (key === "parent") continue
    if (key === "arguments" && (node.type === "CallExpression" || node.type === "NewExpression")) continue
    const value = node[key]
    const children = Array.isArray(value) ? value : [value]
    for (const child of children) {
      if (child && typeof child.type === "string") nested = Math.max(nested, nestedConditionDepth(child))
    }
  }
  return here + nested
}

function sitsInJsx(node) {
  let parent = node.parent
  while (parent) {
    if (FUNCTION_TYPES.has(parent.type)) return false
    if (parent.type === "JSXElement" || parent.type === "JSXFragment" || parent.type === "JSXExpressionContainer") return true
    parent = parent.parent
  }
  return false
}

function sitsInsideConditional(node) {
  let child = node
  let parent = node.parent
  while (parent) {
    if (FUNCTION_TYPES.has(parent.type)) return false
    if ((parent.type === "CallExpression" || parent.type === "NewExpression") && parent.arguments.includes(child)) return false
    if (parent.type === "JSXElement" || parent.type === "JSXFragment") return false
    if (parent.type === "ConditionalExpression") return true
    child = parent
    parent = parent.parent
  }
  return false
}

module.exports = {
  "no-complex-nested-conditions": {
    meta: {
      type: "problem",
      docs: {
        description: "a conditional nested 3 or more levels deep",
      },
      schema: [],
      messages: {
        nestedConditions:
          "This condition is nested {{depth}} levels. Split each check into its own one-line arrow, then one const per branch.",
      },
    },
    create(context) {
      return {
        ConditionalExpression(node) {
          if (sitsInJsx(node) || sitsInsideConditional(node)) return
          const depth = nestedConditionDepth(node)
          if (depth < MAX_NESTED_CONDITIONS) return
          context.report({ node, messageId: "nestedConditions", data: { depth } })
        },
      }
    },
  },
}
