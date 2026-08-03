import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

import localRules from "./eslint-rules/index.js"
import jsonProcessors from "./eslint-rules/json-processor.js"

// One plugin object, reused by every block below. eslint 9.17 rejects a second block that
// redefines "local-rules" with a different object, so the identity has to be shared.
const localPlugin = { rules: localRules, processors: jsonProcessors }

// Custom rules live in eslint-rules/*.js, registered as local-rules/<id> below.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // .open-next/** is the Cloudflare build output (bundled vendor JS) - linting it produced 23057 of
  // the repo's 23123 problems and nothing actionable, since none of it is hand-written.
  // eslint-rules/** is tool code, not source, so it is not a lint target either.
  globalIgnores([".next/**", ".open-next/**", "out/**", "build/**", "next-env.d.ts", "eslint-rules/**"]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "local-rules": localPlugin,
    },
    rules: {
      "local-rules/envs-order": "warn",
      "local-rules/no-defined-unused-envs": "warn",
      "local-rules/no-undefined-used-envs": "warn",

      // a leading _ is this project's marker for a parameter kept only to hold the shared call shape
      // (e.g. assertBackupAccess(_userId, _admin) in app/features/backup/backupConfig.ts)
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // package.json is not JavaScript, so the local `json` processor puts it in parentheses first -
    // that makes it one object expression espree reads, with every line number unchanged.
    files: ["package.json"],
    plugins: {
      "local-rules": localPlugin,
    },
    processor: "local-rules/json",
  },
  {
    // A processor hands eslint its output as a virtual file named "package.json/0.js", and config is
    // resolved by THAT name - so the rule is switched on here, not on the entry above. Getting this
    // wrong is silent: eslint reports the file as linted with zero messages and the rule never runs.
    files: ["**/package.json/*.js"],
    plugins: {
      "local-rules": localPlugin,
    },
    rules: {
      "local-rules/no-unused-dependencies": "warn",
    },
  },
])

export default eslintConfig
