"use strict"

// His words (21.11.2026): "if you use in ternary const then don't use function" + "!== true is bad because you use
// !== / better use === where possible" + "if noone userstand your shorter it's bad".
// A function's answer compared inside an `&&` / `||` / `? :` makes the reader run the function in their head in the
// middle of the condition. A named const above it names that answer once, then the condition reads as words.
//
// 👎 Bad (the call is compared inside the condition):
//                    🔻
//   const isVerifaliaCredInvalid = !isZerobounce && validateVerifaliaCred(credential) !== true
// 👍 Good (1 const - true, or the error text):
//   const isCredValid = validateVerifaliaCred(credential)
//   if (!isZerobounce && typeof isCredValid === "string") return
//
// 👎 Bad (`!== true` / `!== false` - the reader flips it in their head):
//                    🔻
//   if (isCredValid !== true) return
// 👍 Good:
//   if (typeof isCredValid === "string") return   (a true | string answer)
//   if (isCredValid === false) return             (a boolean)

const COMPARISON_OPERATORS = new Set(["===", "!==", "==", "!="])

function isCall(node) {
  if (!node) return false
  if (node.type === "CallExpression") return true
  return node.type === "AwaitExpression" && node.argument.type === "CallExpression"
}

// the comparison is 1 part of an `&&` / `||` / `??`, or the test of a `? :` - a `!` in between counts too
function isPartOfCondition(node) {
  const parent = node.parent
  if (!parent) return false
  if (parent.type === "LogicalExpression") return true
  if (parent.type === "ConditionalExpression" && parent.test === node) return true
  if (parent.type === "UnaryExpression" && parent.operator === "!") return isPartOfCondition(parent)
  return false
}

function getCalleeName(call) {
  const callExpression = call.type === "AwaitExpression" ? call.argument : call
  const callee = callExpression.callee
  if (callee.type === "Identifier") return callee.name
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") return callee.property.name
  return "the function"
}

module.exports = {
  "no-fn-call-in-condition": {
    meta: {
      type: "suggestion",
      docs: {
        description: "disallow a function's answer compared inside && / || / ? :, and !== true / !== false",
      },
      schema: [],
      messages: {
        callInCondition:
          'Assign {{name}}(...) to a named const above, then use the const here - "const isCredValid = {{name}}(...)" -> "!isZerobounce && typeof isCredValid === \\"string\\"".',
        negatedBoolean:
          '"!== {{value}}" makes the reader flip it - a boolean: "=== {{opposite}}", a true | string answer: "typeof x === \\"string\\"".',
      },
    },
    create(context) {
      return {
        BinaryExpression(node) {
          if (!COMPARISON_OPERATORS.has(node.operator)) return

          const isBooleanRight = node.right.type === "Literal" && typeof node.right.value === "boolean"
          if (node.operator === "!==" && isBooleanRight) {
            const value = String(node.right.value)
            const opposite = String(!node.right.value)
            context.report({ node, messageId: "negatedBoolean", data: { value, opposite } })
          }

          if (!isPartOfCondition(node)) return
          const call = [node.left, node.right].find(isCall)
          if (call) context.report({ node: call, messageId: "callInCondition", data: { name: getCalleeName(call) } })
        },
      }
    },
  },
}
