"use strict"

// An onClick/onChange/... written directly in JSX as `async () => { ... }` slips past
// require-handlers-hook-async-fn (that rule only looks at a NAMED declaration - a FunctionDeclaration
// or a `const handleXxx = () => {}`, never a function literal sitting straight inside a JSXAttribute
// value). AIMoveDecisionsHeader.tsx's close button had exactly this: a 7-real-line async onClick with
// half the block in comments (20.09.2026 at 12-55.jpg, his own arrows: "why here 1/2 commented lines
// 1/2 inline onClick code instead of handleCloseAIMoveDecisionsScreen"). Fixed by pulling it into
// useAIMoveDecisionsHeaderHandlers's own handleCloseAIMoveDecisionsScreen - this rule is what catches
// the next one instead of it sitting unflagged the same way.
//
// Scoped to every onXxx prop, not only onClick - the mechanism (real logic inlined in a JSX attribute)
// is identical whatever the prop is named.
//
// Bad:
//   <button onClick={async () => {
//     if (x) { await y() }
//     setZ(true)
//     doW()
//   }}>
// Good:
//   const { handleCloseThing } = useThisComponentHandlers()
//   <button onClick={handleCloseThing}>

// his own bar (20.09.2026 at 12-55.jpg): "inline on click more than 4 lines is too much"
const MAX_INLINE_HANDLER_LINES = 4

function countRealBodyLines(sourceCode, blockNode) {
  const commentLines = new Set()
  for (const comment of sourceCode.getCommentsInside(blockNode)) {
    for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) commentLines.add(line)
  }
  let count = 0
  for (let line = blockNode.loc.start.line + 1; line < blockNode.loc.end.line; line++) {
    const text = sourceCode.lines[line - 1]?.trim() ?? ""
    if (text && !(commentLines.has(line) && !/[;)}=]/.test(text))) count++
  }
  return count
}

function getComponentBasename(filename) {
  return filename
    .split("/")
    .pop()
    .replace(/\.tsx$/, "")
}

function isInlineFunctionExpression(node) {
  return (
    (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") && node.body.type === "BlockStatement"
  )
}

module.exports = {
  "no-inline-on-click": {
    meta: {
      type: "suggestion",
      docs: {
        description: "require a long inline onClick/onChange/... function to be extracted into a useXxxHandlers hook",
      },
      schema: [],
      messages: {
        extractHandlersHook:
          'This "{{attributeName}}" is an inline function with {{lineCount}} body lines - move it into a "{{suggestedHook}}" hook instead (a handleXxx returned from it), matching this codebase\'s useXxxHandlers convention.',
      },
    },
    create(context) {
      const filename = context.filename ?? context.getFilename()
      const sourceCode = context.sourceCode ?? context.getSourceCode()
      if (!filename.endsWith(".tsx")) return {}

      const suggestedHook = `use${getComponentBasename(filename)}Handlers`

      return {
        JSXAttribute(node) {
          if (node.name.type !== "JSXIdentifier" || !/^on[A-Z]/.test(node.name.name)) return
          const value = node.value
          if (value?.type !== "JSXExpressionContainer") return
          const expression = value.expression
          if (!isInlineFunctionExpression(expression)) return

          const lineCount = countRealBodyLines(sourceCode, expression.body)
          if (lineCount <= MAX_INLINE_HANDLER_LINES) return

          context.report({
            node: expression,
            messageId: "extractHandlersHook",
            data: { attributeName: node.name.name, lineCount, suggestedHook },
          })
        },
      }
    },
  },
}
