"use strict"

// Lets eslint lint package.json with the normal JS parser, so a rule can report ON the offending
// line of package.json instead of somewhere else.
//
// JSON is not a valid JS *program* - `{"a": 1}` parses as a block with a syntax error - but it IS a
// valid JS *expression*. Wrapping the whole file in parentheses turns it into one espree can read:
//
//     {"name": "joki", ...}      ->      ({"name": "joki", ...})
//
// The opening paren goes on line 1 and the closing one after the last line, so every line number is
// unchanged and only column 1 of line 1 shifts. A reported line therefore points at the real line of
// the real file, which is the whole point.
//
// No new dependency: a processor is a bare object, and both eslint 8 (overrides.processor) and
// eslint 9 (flat config `processor`) accept one from a local plugin.

module.exports = {
  json: {
    meta: { name: "local-rules/json" },
    // package.json is data, never source, so nothing here is auto-fixable
    supportsAutofix: false,
    preprocess(text) {
      return [{ text: `(${text})`, filename: "0.js" }]
    },
    postprocess(messages) {
      return messages[0] ?? []
    },
  },
}
