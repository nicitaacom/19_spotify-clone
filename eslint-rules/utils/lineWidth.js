"use strict"

function getIndentString(sourceCode, node) {
  const line = sourceCode.lines[node.loc.start.line - 1] ?? ""
  return line.match(/^[\t ]*/)?.[0] ?? ""
}

module.exports = { getIndentString }
