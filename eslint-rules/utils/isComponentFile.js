"use strict"

// "Is the file being linted a React component file" - a .tsx whose own basename is PascalCase AND
// whose text actually renders JSX somewhere. The text check is what keeps a PascalCase .tsx that
// only holds types/consts out, since the extension and the name alone never prove a render.
//
// 9 rules held a byte-identical copy of this until 2026-08-19 (require-5-states,
// no-pointless-component, no-prop-drilled-usestate, no-prop-drilled-list-map,
// no-effect-in-large-component, require-handlers-hook-async-fn, require-handlers-hook-callbacks,
// use-usesetsmth-hook, no-type-export-in-srv-or-clnt-comp) - 9 places for one answer to drift.
function isComponentFile(filename, sourceCode) {
  if (!filename.endsWith(".tsx")) return false
  const basename = filename.split("/").pop().replace(/\.tsx$/, "")
  if (!/^[A-Z]/.test(basename)) return false
  return /return\s*\(?\s*</.test(sourceCode.getText()) || /<[A-Z]/.test(sourceCode.getText())
}

module.exports = { isComponentFile }
