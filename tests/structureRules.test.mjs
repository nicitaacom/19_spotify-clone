import { createRequire } from "node:module"
import { RuleTester } from "eslint"

const require = createRequire(import.meta.url)
const nested = require("../eslint-rules/no-complex-nested-conditions.js")["no-complex-nested-conditions"]
const factory = require("../eslint-rules/no-component-factory.js")["no-component-factory"]
const effect = require("../eslint-rules/no-effect-in-large-component.js")["no-effect-in-large-component"]
const earlyReturn = require("../eslint-rules/obvious/prefer-early-return.js")["prefer-early-return"]
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

tester.run("no-component-factory", factory, {
  valid: [
    "function Component() { return <div /> }",
    "function makeCallback() { return () => 42 }",
    "function useRenderer() { return () => <div /> }",
  ],
  invalid: [
    { code: "function makeComponent() { return function Widget() { return <div /> } }", errors: [{ messageId: "noComponentFactory" }] },
    { code: "const makeComponent = () => { return () => <div /> }", errors: [{ messageId: "noComponentFactory" }] },
  ],
})

const longEffect = "useEffect(() => {\n  step1()\n  step2()\n  step3()\n  step4()\n  step5()\n  step6()\n}, [])"
const padding = "\n".repeat(100)
tester.run("no-effect-in-large-component", effect, {
  valid: [
    { filename: "/repo/components/Example.tsx", code: `${padding}function Example() { useEffect(() => {}, []); return <div /> }` },
    { filename: "/repo/components/Example.tsx", code: `${padding}function useSomething() { ${longEffect} }\nfunction Example() { return <div /> }` },
    { filename: "/repo/components/PlayerContent.tsx", code: `${padding}function Example() { ${longEffect}; return <div /> }` },
  ],
  invalid: [
    { filename: "/repo/components/Example.tsx", code: `${padding}function Example() { ${longEffect}; return <div /> }`, errors: [{ messageId: "noEffectInLargeComponent" }] },
  ],
})

tester.run("prefer-early-return", earlyReturn, {
  valid: [
    "function run() { if (!ready) return; work() }",
    "function run() { if (ready) { work() } }",
    "function run() { if (typeof window === 'undefined') { a();\nb();\nc();\nd();\ne();\nf() } }",
  ],
  invalid: [
    { code: "function run() {\n  if (ready) {\n    a()\n    b()\n    c()\n    d()\n    e()\n    f()\n  }\n}", output: "function run() {\n  if (!ready) return\n\n  a()\n  b()\n  c()\n  d()\n  e()\n  f()\n}", errors: [{ messageId: "preferEarlyReturn" }] },
    { code: "function run() {\n  if (a && b) {\n    one()\n    two()\n    three()\n    four()\n    five()\n    six()\n  }\n}", output: null, errors: [{ messageId: "preferEarlyReturnLogical" }] },
  ],
})
