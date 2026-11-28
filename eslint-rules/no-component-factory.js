"use strict"

// Rule: no-component-factory
// Disallow a function whose job is to RETURN a functional component (a "component factory") -
// his own words (20.09.2026, MoveBulkFilterConditions.tsx's own makeMoveConditionValueSlot):
// "don't use that crutch, function that return functional component, this is a crutch".
//
// 👎 Bad (the factory this rule itself catches):
//   function makeMoveConditionValueSlot(LabelPickerSlot, FolderPickerSlot) {
//     🔻
//     return function MoveConditionValueSlot({ condition }) { ... return <div>...</div> }
//   }
//
// 👎 Also bad (a different crutch for the same problem, caught by no-react-context.js instead -
// this shape is not a factory function, so this rule alone would miss it):
//                                                        🔻
//   const { LabelPickerSlot, FolderPickerSlot } = useContext(PickersContext)
//
// 👍 Good: the component itself, top-level, no factory, no Context.
//   ▼
//   function MoveConditionValueSlot({ condition, LabelPickerSlot, FolderPickerSlot }) { ... }

function isCapitalized(name) {
  return /^[A-Z]/.test(name)
}

function looksLikeComponentBody(fn, sourceText) {
  if (!fn || (fn.type !== "FunctionExpression" && fn.type !== "ArrowFunctionExpression")) return false
  // named function expression with a capitalized name - function MoveConditionValueSlot(...) {...}
  if (fn.id && isCapitalized(fn.id.name)) return true
  // arrow/anonymous function - only counts if it returns JSX somewhere in its own body, so an
  // arrow returning a non-JSX value/callback (a real factory of NON-component functions) is not flagged
  return typeof sourceText === "string" && /<[A-Za-z]/.test(sourceText)
}

module.exports = {
  "no-component-factory": {
    meta: {
      type: "problem",
      docs: {
        description: 'a function that returns a functional component ("component factory") - build the component once at module scope instead',
      },
      schema: [],
      messages: {
        noComponentFactory:
          'this function returns a component ("{{name}}") instead of being one - a component factory. Define "{{name}}" once at module scope and read what it needs from its own props or a Context, instead of manufacturing it inside "{{outer}}".',
      },
    },
    create(context) {
      const sourceCode = context.sourceCode ?? context.getSourceCode()

      function checkOuterFunction(outerNode, outerName) {
        if (/^use[A-Z]/.test(outerName ?? "")) return // hooks returning a render-prop fn are a different, allowed shape

        const body = outerNode.body
        if (!body || body.type !== "BlockStatement") return

        for (const statement of body.body) {
          if (statement.type !== "ReturnStatement" || !statement.argument) continue
          const returned = statement.argument
          if (returned.type !== "FunctionExpression" && returned.type !== "ArrowFunctionExpression") continue

          const sourceText = sourceCode.getText(returned)
          if (!looksLikeComponentBody(returned, sourceText)) continue

          const returnedName = returned.id ? returned.id.name : outerName
          context.report({
            node: returned,
            messageId: "noComponentFactory",
            data: { name: returnedName, outer: outerName || "this function" },
          })
        }
      }

      return {
        FunctionDeclaration(node) {
          checkOuterFunction(node, node.id ? node.id.name : null)
        },
        VariableDeclarator(node) {
          if (node.id.type !== "Identifier" || !node.init) return
          if (node.init.type !== "ArrowFunctionExpression" && node.init.type !== "FunctionExpression") return
          checkOuterFunction(node.init, node.id.name)
        },
      }
    },
  },
}
