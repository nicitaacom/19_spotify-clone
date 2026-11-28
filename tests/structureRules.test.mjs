import { createRequire } from "node:module"
import { RuleTester } from "eslint"

const require = createRequire(import.meta.url)
const nested = require("../eslint-rules/no-complex-nested-conditions.js")["no-complex-nested-conditions"]
const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, parserOptions: { ecmaFeatures: { jsx: true } } } })

tester.run("no-complex-nested-conditions", nested, {
  valid: [
    "const value = a ? b ? 1 : 2 : 3",
    "const view = <div>{a ? b ? c ? 1 : 2 : 3 : 4}</div>",
    "const value = a ? format(b ? c ? 1 : 2 : 3) : 4",
    "const value = a ? <div>{b ? c ? 1 : 2 : 3}</div> : null",
  ],
  invalid: [
    { code: "const value = a ? b ? c ? 1 : 2 : 3 : 4", errors: [{ messageId: "nestedConditions", data: { depth: 3 } }] },
    { code: "const value = a ? format(b ? c ? d ? 1 : 2 : 3 : 4) : 5", errors: [{ messageId: "nestedConditions", data: { depth: 3 } }] },
  ],
})
