import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"

async function compile(path) {
  const compiled = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const compiledModule = { exports: {} }
  new Function("require", "module", "exports", compiled)(() => {
    throw new Error("unexpected import")
  }, compiledModule, compiledModule.exports)
  return compiledModule.exports
}

const { errorText, httpErrorMessage } = await compile("../libs/errorText.ts")

test("an empty HTTP body keeps the status and the empty-body sentence", () => {
  const message = httpErrorMessage({ action: "Upload of \"demo.mp3\"", status: 503, statusText: "", bodyText: "" })
  assert.equal(message.includes("no error text"), false)
  assert.match(message, /Upload of "demo\.mp3" failed: HTTP 503\. Response body was empty\./)
})

test("a JSON error body keeps the server fields", () => {
  const message = httpErrorMessage({
    action: "Upload of \"demo.mp3\"",
    status: 500,
    statusText: "Internal Server Error",
    url: "http://localhost:3001/api/songs",
    bodyText: JSON.stringify({ error: "Playlist not found.", code: "PGRST116", details: "0 rows" }),
  })
  assert.match(message, /HTTP 500 Internal Server Error http:\/\/localhost:3001\/api\/songs/)
  assert.match(message, /Playlist not found\./)
  assert.match(message, /code PGRST116/)
  assert.match(message, /0 rows/)
})

test("error text keeps the name, message, cause, and database code", () => {
  const cause = new Error("connection reset")
  cause.name = "SocketError"
  const error = new Error("insert rejected")
  error.name = "PostgrestError"
  error.cause = cause
  error.code = "23505"
  error.details = "Key already exists."
  assert.equal(
    errorText(error),
    "PostgrestError: insert rejected. code 23505. Key already exists. Cause: SocketError: connection reset.",
  )
})
