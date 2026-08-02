import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // .open-next/** is the Cloudflare build output (bundled vendor JS) - linting it produced 23057 of
  // the repo's 23123 problems and nothing actionable, since none of it is hand-written
  globalIgnores([".next/**", ".open-next/**", "out/**", "build/**", "next-env.d.ts"]),
])

export default eslintConfig
