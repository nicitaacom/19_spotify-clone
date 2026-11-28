import { createRequire } from "node:module"
import { RuleTester } from "eslint"

const require = createRequire(import.meta.url)
const rule = require("../eslint-rules/no-fn-call-in-condition.js")["no-fn-call-in-condition"]
const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022 } })

tester.run("no-fn-call-in-condition", rule, {
  valid: [
    "const result = check(); if (enabled && result === true) proceed()",
    "if (value === false) proceed()",
    "const disabled = value === false; if (!disabled) proceed()",
    "if (check() === true) proceed()",
  ],
  invalid: [
    { code: "if (enabled && check() === true) proceed()", errors: [{ messageId: "callInCondition" }] },
    { code: "const label = check() === 1 ? 'one' : 'other'", errors: [{ messageId: "callInCondition" }] },
    { code: "async function run() { return enabled && (await check()) === true }", errors: [{ messageId: "callInCondition" }] },
    { code: "if (value !== false) proceed()", errors: [{ messageId: "negatedBoolean" }] },
    { code: "if (enabled && check() !== true) proceed()", errors: [{ messageId: "negatedBoolean" }, { messageId: "callInCondition" }] },
  ],
})
