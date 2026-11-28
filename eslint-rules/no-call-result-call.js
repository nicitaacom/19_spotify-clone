"use strict"

// A function returned by a call must be assigned a name before it is called.
// Bad:  handleDelete(something)(id)
// Good: const deleteItem = handleDelete(something); deleteItem(id)
const WRAPPERS = new Set(["ChainExpression", "TSAsExpression", "TSTypeAssertion", "TSNonNullExpression", "TSInstantiationExpression"])

module.exports = {
  "no-call-result-call": {
    meta: {
      type: "suggestion",
      docs: { description: "disallow calling the result of another call directly" },
      schema: [],
      messages: { noCallResultCall: "Assign the returned function to a named variable before calling it." },
    },
    create(context) {
      return {
        CallExpression(node) {
          let callee = node.callee
          while (WRAPPERS.has(callee.type)) callee = callee.expression
          if (callee.type === "CallExpression" || callee.type === "NewExpression") {
            context.report({ node, messageId: "noCallResultCall" })
          }
        },
      }
    },
  },
}
