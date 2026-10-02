"use strict"

// Bad:
//   <button onClick={() => { void handleDelete(id) }}>
// Good:
//   <button onClick={() => handleDelete(id)}>
function isJsxEventHandler(node) {
  const parent = node.parent
  if (!parent || parent.type !== "JSXExpressionContainer") return false

  const attribute = parent.parent
  if (!attribute || attribute.type !== "JSXAttribute") return false
  if (!attribute.name || attribute.name.type !== "JSXIdentifier") return false

  return /^on[A-Z]/.test(attribute.name.name)
}

module.exports = {
  "no-void-only-jsx-handler": {
    meta: {
      type: "suggestion",
      docs: {
        description: "disallow JSX event handlers whose whole body is `void someCall(...)`; use an implicit-return wrapper",
      },
      schema: [],
      messages: {
        noVoidOnlyHandler:
          "Avoid a JSX handler block whose only statement is `void someCall(...)` - use an implicit-return wrapper like `event => fn(event)`.",
      },
    },
    create(context) {
      return {
        ArrowFunctionExpression(node) {
          if (!isJsxEventHandler(node)) return
          if (node.body.type !== "BlockStatement") return
          if (node.body.body.length !== 1) return

          const statement = node.body.body[0]
          if (statement.type !== "ExpressionStatement") return
          if (statement.expression.type !== "UnaryExpression") return
          if (statement.expression.operator !== "void") return
          if (statement.expression.argument.type !== "CallExpression") return

          context.report({ node: statement.expression, messageId: "noVoidOnlyHandler" })
        },
      }
    },
  },
}
