import { createRequire } from 'node:module'
import { RuleTester } from 'eslint'

const require = createRequire(import.meta.url)
const rule = require('../eslint-rules/no-call-result-call.js')['no-call-result-call']
const tester = new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } } })

tester.run('no-call-result-call', rule, {
  valid: [
    'const remove = handleDelete(something); remove(id)',
    'const submit = handleSubmit(onSubmit); submit(event)',
    'client.fetch().json()',
    '(() => doWork())()',
    'handlers[lookup()]()',
  ],
  invalid: [
    { code: 'handleDelete(something)(id)', errors: [{ messageId: 'noCallResultCall' }] },
    { code: '<form onSubmit={event => handleSubmit(onSubmit)(event)} />', errors: [{ messageId: 'noCallResultCall' }] },
    { code: '(getHandler())?.(id)', errors: [{ messageId: 'noCallResultCall' }] },
    { code: 'new Function("return 1")()', errors: [{ messageId: 'noCallResultCall' }] },
  ],
})

const typescriptParser = require(require.resolve('@typescript-eslint/parser', { paths: [require.resolve('eslint-config-next')] }))
const typescriptTester = new RuleTester({ languageOptions: { parser: typescriptParser, parserOptions: { ecmaFeatures: { jsx: true } } } })
typescriptTester.run('no-call-result-call with TypeScript', rule, {
  valid: ['const handler = getHandler(); handler(id)'],
  invalid: [
    { code: '(getHandler() as (id: string) => void)(id)', errors: [{ messageId: 'noCallResultCall' }] },
    { code: 'getHandler()!(id)', errors: [{ messageId: 'noCallResultCall' }] },
  ],
})
