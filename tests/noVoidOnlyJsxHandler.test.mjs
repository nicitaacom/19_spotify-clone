import { createRequire } from 'node:module'
import { RuleTester } from 'eslint'

const require = createRequire(import.meta.url)
const rule = require('../eslint-rules/no-void-only-jsx-handler.js')['no-void-only-jsx-handler']
const tester = new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } } })

tester.run('no-void-only-jsx-handler', rule, {
  valid: [
    '<form onSubmit={event => handleSubmit(onSubmit)(event)} />',
    '<button onClick={() => handleDelete(id)} />',
    '<button onClick={() => { handleDelete(id); updateStatus() }} />',
    '<button onClick={() => later(() => { void handleDelete(id) })} />',
    'const handler = event => { void handleSubmit(onSubmit)(event) }',
  ],
  invalid: [
    {
      code: '<form onSubmit={event => { void handleSubmit(onSubmit)(event) }} />',
      errors: [{ messageId: 'noVoidOnlyHandler' }],
    },
    {
      code: '<button onClick={() => { void handleDelete(id) }} />',
      errors: [{ messageId: 'noVoidOnlyHandler' }],
    },
    {
      code: '<button onClick={() => { updateStatus(); void handleDelete(id) }} />',
      errors: [{ messageId: 'noVoidOnlyHandler' }],
    },
    {
      code: '<button onClick={() => void handleDelete(id)} />',
      errors: [{ messageId: 'noVoidOnlyHandler' }],
    },
  ],
})
