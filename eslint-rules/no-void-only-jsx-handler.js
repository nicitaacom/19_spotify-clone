"use strict"

// Bad:
//   <button onClick={() => { void handleDelete(id) }}>
//   <button onClick={() => { toast.closeToast(); void handleDelete(id) }}>
//   <button onClick={() => void handleDelete(id)}>
// Good:
//   <button onClick={() => handleDelete(id)}>
//   <button onClick={() => { toast.closeToast(); handleDelete(id) }}>
const FUNCTION_TYPES = new Set(["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"])

function isJsxEventHandler(node) {
  const parent = node.parent
  if (!parent || parent.type !== "JSXExpressionContainer") return false

  const attribute = parent.parent
  if (!attribute || attribute.type !== "JSXAttribute") return false
  if (!attribute.name || attribute.name.type !== "JSXIdentifier") return false

  return /^on[A-Z]/.test(attribute.name.name)
}

// the function the void sits in - a callback nested inside the handler is its own function, not the handler
function closestFunction(node) {
  let current = node.parent
  while (current && !FUNCTION_TYPES.has(current.type)) current = current.parent
  return current
}

module.exports = {
  "no-void-only-jsx-handler": {
    meta: {
      type: "suggestion",
      docs: {
        description: "disallow `void someCall(...)` anywhere in a JSX event handler; call it directly",
      },
      schema: [],
      messages: {
        noVoidOnlyHandler:
          "Avoid `void someCall(...)` in a JSX handler - call it directly: `() => fn()` or `() => { a(); fn() }`.",
      },
    },
    create(context) {
      return {
        UnaryExpression(node) {
          if (node.operator !== "void" || node.argument.type !== "CallExpression") return
          const handler = closestFunction(node)
          if (!handler || !isJsxEventHandler(handler)) return

          context.report({ node, messageId: "noVoidOnlyHandler" })
        },
      }
    },
  },
}
