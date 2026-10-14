"use strict"

function isGetStateCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "getState"
  )
}

function reportGetStateCallsIn(context, conditional, reportedCalls) {
  if (!conditional) return

  const nodes = [conditional]
  while (nodes.length > 0) {
    const node = nodes.pop()
    if (!node || typeof node.type !== "string") continue

    if (isGetStateCall(node) && !reportedCalls.has(node)) {
      reportedCalls.add(node)
      context.report({ node, messageId: "readBeforeCondition" })
    }

    // A callback declared in a branch runs later, outside the conditional's execution path.
    if (
      node !== conditional &&
      ["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"].includes(node.type)
    ) {
      continue
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === "parent") continue
      if (Array.isArray(value)) nodes.push(...value)
      else if (value && typeof value.type === "string") nodes.push(value)
    }
  }
}

module.exports = {
  "no-zustand-get-state-in-condition": {
    meta: {
      type: "suggestion",
      docs: {
        description: "disallow inline Zustand getState calls inside if/else, switch, and conditional expressions",
      },
      schema: [],
      messages: {
        readBeforeCondition:
          "Read the Zustand store state into a named variable before the conditional instead of calling `.getState()` inline.",
      },
    },
    create(context) {
      const reportedCalls = new WeakSet()

      return {
        IfStatement(node) {
          // An `else if` is another IfStatement, nested in the previous statement's alternate.
          reportGetStateCallsIn(context, node, reportedCalls)
        },
        ConditionalExpression(node) {
          reportGetStateCallsIn(context, node, reportedCalls)
        },
        SwitchStatement(node) {
          reportGetStateCallsIn(context, node, reportedCalls)
        },
      }
    },
  },
}
