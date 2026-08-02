"use strict"

// This project's own eslint rules, handed to eslint.config.mjs as the "local-rules" plugin. Each
// rule file exports { "<rule-id>": { meta, create } }, so spreading them here registers the id.
module.exports = {
  // file name differs from the rule id ("envs-order") on purpose - see the header of vars-order.js
  ...require("./vars-order"),
  // same here - the rule id is "no-unused-envs", see the header of unused-declared-vars.js
  ...require("./unused-declared-vars"),
}
