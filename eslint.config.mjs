import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

import localRules from "./eslint-rules/index.js"

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
      "local-rules": { rules: localRules },
    },
    rules: {
      "local-rules/envs-order": "warn",
      "local-rules/no-unused-envs": "warn",

      // a leading _ is this project's marker for a parameter kept only to hold the shared call shape
      // (e.g. assertBackupAccess(_userId, _admin) in app/features/backup/backupConfig.ts)
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
])

export default eslintConfig
