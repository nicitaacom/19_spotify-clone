"use strict"

// DEPENDS ON: outreach-tool's eslint-rules/no-vague-error-msg.js - copied from there, plus react-hot-toast's
// toast.error("...") (isHotToastErrorCall below), the error toast this repo shows. Edit both.
//
// An error message the user reads has to answer 3 questions: what actually failed, what they lost
// because of it, and what to do now. "Unexpected system error." answers none of the 3 - the user
// sees a wall with no handle on it and the only step left is guessing.
//
// Bad:
//   setErrorMessage("Unexpected system error.")
//   toast.show("error", "Failed to fetch raw JSON data", "")
// Good:
//   setErrorMessage("Internet connection lost - I retried 2 times (10 s and 20 s apart). DNC results not fetched - contact support")
//   toast.show("error", "Internet connection lost", "Emails not fetched - I retried 2 times (10 s and 20 s apart) - contact support")
//
// Fires on the 2 places a user actually reads an error in this codebase:
//   1. the 5-states error state - setError / setErrorMessage / setLocalError / setPhoneError (any
//      set<Something>Error<Something> name), see require-5-states
//   2. toast.show("error", title, description) - the toast renders both halves at once, so they are
//      read as ONE message here: a next step in either half counts for the whole thing
//
// 4 checks, reported highest-priority-first so one call site produces one message, never four:
//   1. fillerMessage  - the whole message is filler ("something went wrong", "unknown error")
//   2. developerTerm  - it shows a word out of the code, not out of the user's world (JSON, null,
//      connectionRef, NEXT_PUBLIC_WS_URL)
//   3. noSelfRetry    - it hands the user a "try again" / "retry" / "please wait a moment" the code could
//      do itself, and never shows that the code already did ("I retried 2 times - 10 s and 20 s apart - still ...")
//   4. noNextStep     - nothing in it shows what to do (reload the page / contact support / the exact
//      value to enter)
//
// Only STATIC text gets checked - a `${}` interpolation or a variable (error.message, response) is
// whatever the server returned at runtime and this rule has no way to read it. A toast whose
// description is a variable still gets checks 1 and 2 on its static title (filler is filler either
// way) but skips check 3 - the runtime half is exactly where a server's own next step would sit.
// The one runtime shape it does read is the SOURCE of that half: a caught error's own `error.message` /
// `String(error)` as an error toast's description is rawErrorMessage - `{ error }` in the options instead.

// Filler: the message names no real cause, so rewriting the words around it changes nothing - the
// whole sentence has to be replaced with what actually failed. `oc+ur+ed` on purpose: "occured" and
// "occcured" are both already in this codebase's own messages, and a typo is still filler.
const FILLER_PHRASES = [
  /\bunexpected (system |server )?(error|failure)\b/,
  /\bsomething went wrong\b/,
  /\berror\s+(has\s+)?oc+ur+ed\b/,
  /\b(an?|the)\s+(unknown|unexpected)\s+error\b/,
  /\bunknown error\b/,
  /\binternal (server )?error\b/,
  /\b(operation|request|action) failed\b/,
  /\bfailed unexpectedly\b/,
  // the JS runtime's OWN SyntaxError from response.json() on an empty body. It names the parser and
  // nothing the reader lost - his 2026-09-06 words: "I don't understand what is that and 'end of
  // JSON input'". It usually reaches a screen as `error.message` passed straight through, which no
  // lint rule can read, so the fix belongs in the catch: translate it into what happened (the
  // server answered nothing) and hand over a way to run the same select again
  /\bunexpected end of (json )?input\b/,
  // the browser's OWN TypeError when a request never reached a server - "Failed to fetch" reads as
  // if this app broke, while it is almost always the box restarting or the connection dropping.
  // Same shape as the line above: it usually arrives as `error.message` passed straight through, so
  // the fix belongs in the catch - name what happened and retry before anything reaches a screen
  /\bfailed to fetch\b/,
  /\bnetworkerror\b/,
  /\bnetwork request failed\b/,
]

// The entire message is one bare word - no cause, no effect, no step out. Checked separately from
// FILLER_PHRASES because "error"/"failed" ALONE is filler while "Error checking attachments" at
// least names the thing that failed (that one lands on noNextStep instead, a smaller rewrite).
const FILLER_WHOLE_MESSAGES = new Set(["error", "error!", "failed", "failure", "unknown", "invalid", "critical", "warning"])

// Words the user has no idea about because they only exist in the code or the infrastructure. Kept
// tight on purpose - each one here would be gibberish on screen to someone who just wants their
// emails. Deliberately NOT in this list:
//   - "lambda" / "SID" / "API key" - real labels this app puts on screen (LambdaControlPanel, the
//     Twilio setup fields), so a message naming them is speaking the user's own vocabulary
//   - "email"/"account"/"subscription" - the user's world already, that's the whole point
const DEVELOPER_TERMS = [
  "json",
  "xml",
  "http",
  "https",
  "websocket",
  "socket",
  "endpoint",
  "payload",
  "null",
  "undefined",
  "nan",
  "regex",
  "sql",
  "redis",
  "supabase",
  "dynamodb",
  "s3",
  "stack trace",
  "promise",
  "callback",
  "mutex",
  "boolean",
  "enum",
  "props",
  "dom",
  "response body",
  "request body",
  "status code",
]

// Nouns this codebase has several KINDS of - "Error accepting decision" leaves the reader asking
// which one, because move / reply / blast / scraping decisions all exist and all have their own
// screen. The fix is one adjective, not a rewrite: "Error accepting AI move decision".
// "profile" was tried here too and pulled in 22 messages that already sit inside one profile screen
// ("Failed to rename profile") - the reader is looking at the thing, so the word adds nothing there.
const AMBIGUOUS_NOUNS = ["decision"]
const AMBIGUOUS_NOUN_QUALIFIERS = ["move", "reply", "replies", "blast", "scraping", "email", "sending"]

// A code identifier pasted straight into the message - "connectionRef not found to mute",
// "Missing NEXT_PUBLIC_BACKEND_BEARER". camelCase has to START at a word boundary with a lowercase
// letter, so a product name that merely holds an inner capital (TwiML, PayPal) never trips it.
const CAMEL_CASE_IDENTIFIER = /\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/
const ENV_VAR_IDENTIFIER = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/

// A QUOTED identifier is the opposite of leaked code - it's the exact text the user has to type,
// which is the best kind of next step there is (`CSV column must be "zerobounceAPIKey"`). Quotes are
// the signal, so an unquoted one still fires and the fix is to quote it, which is what tells the
// user it's a value rather than a word. Only the identifier patterns skip quoted text - a word off
// DEVELOPER_TERMS is gibberish to the user quoted or not.
const QUOTED_VALUE = /"[^"]*"|'[^']*'|`[^`]*`/g

// The step out of the error, in the user's hands. A message holding one of these gives them
// something to do; a message without one leaves them holding a fact and nothing else. Matched on
// word boundaries, so "Wait!" counts and "settings"/"user"/"address" never stand in for
// "set"/"use"/"add". The base verb form only - "Error deleting metric" is the system reporting,
// "Delete the row first" is the user's move.
// "must"/"required" count - "End hour must be after start hour" IS the instruction, phrased as the
// rule. "please" counts - every "please X" in this codebase is followed by a real action.
const NEXT_STEP_WORDS = [
  "retry",
  "try again",
  "reload",
  "refresh",
  "contact support",
  "contact us",
  "contact",
  "report",
  "check",
  "select",
  "choose",
  "pick",
  "open",
  "edit",
  "enter",
  "type",
  "write",
  "fill",
  "add",
  "remove",
  "delete",
  "rename",
  "upload",
  "download",
  "resend",
  "verify",
  "confirm",
  "cancel",
  "close",
  "sign in",
  "log in",
  "re-login",
  "upgrade",
  "wait",
  "must",
  "required",
  "use",
  "set",
  "change",
  "fix",
  "connect",
  "reconnect",
  "restart",
  // this repo's own word for replacing a burnt sending domain - dev_readme-sfue calls it the
  // "rotation principle" (rotate every ~3-6 months). A user reading "rotate domain" knows the step.
  "rotate",
  "switch",
  "enable",
  "disable",
  "allow",
  "update",
  "please",
]

// "Please wait a moment and try again" hands the user a job the code can do itself - wait, then run the
// same thing again. His words (11.11.2026, the dialer's "Phone line not ready yet ... please wait a moment
// and try again"): ""please wait a moment and try again" not fixes it - it should wait a moment itself and
// try again later". So the code retries first (2 times, 10 s then 20 s) and the message shows that it did.
const TRY_AGAIN_PHRASES = [
  /\btry again\b/,
  /\bretry\b/,
  /\btry later\b/,
  /\bplease wait\b/,
  /\bwait a (?:moment|minute|second|few seconds|bit)\b/,
]
// "I retried 2 times", "I tried again myself 2 times", "retried 2 times", "retry 1 of 2" - the code's own retries,
// shown to the user. A message holding one of these may still name a retry the user does as a last step
const SELF_RETRY_PHRASE = /\b(?:i|we)\s+(?:retried|tried again)\b|\bretried\s+\d+\s+times\b|\bretry\s+\d+\s+of\s+\d+\b/

function findTryAgainPhrase(lowercasedText) {
  if (SELF_RETRY_PHRASE.test(lowercasedText)) return null
  const match = TRY_AGAIN_PHRASES.map(phrase => phrase.exec(lowercasedText)).find(Boolean)
  return match ? match[0] : null
}

// "Failed to select accounts" and "Error checking attachments" report what the SYSTEM tried, not
// what the user should do - the verb right behind "failed to"/"error" belongs to the code, so it
// comes out before the next-step scan. Without this, "Failed to select accounts" would read as if
// it were telling the user to select something and the message would pass with no step in it at all.
const SYSTEM_ACTION_PHRASE = /\b(?:failed|fails|failure|unable|error|errors)\s+(?:to\s+)?[a-z]+/g

// set<Something>Error<Something> - setError, setLocalError, setErrorMessage, setPhoneError,
// setAccountSidError. The name is what makes this an error the user reads, not the file it sits in.
const ERROR_SETTER_NAME = /^set[A-Za-z0-9]*Error[A-Za-z0-9]*$/

// A string this rule can actually read at lint time: a string literal, or a template literal with
// zero `${}` in it (same text, backticks only for the newlines).
function getStaticText(node) {
  if (!node) return null
  if (node.type === "Literal" && typeof node.value === "string") return node.value
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked
  return null
}

function isErrorSetterCall(node) {
  return node.callee.type === "Identifier" && ERROR_SETTER_NAME.test(node.callee.name)
}

// toast.error("Audio failed for ...") - react-hot-toast, this repo's error toast. Its 1st argument is the whole
// message the user reads, so it is judged exactly like an error setter's 1st argument.
function isHotToastErrorCall(node) {
  const callee = node.callee
  if (callee.type !== "MemberExpression" || callee.computed) return false
  if (callee.object.type !== "Identifier" || callee.object.name !== "toast") return false
  return callee.property.type === "Identifier" && callee.property.name === "error"
}

// toast.show("error", title, description) - also matches useToast.getState().show("error", ...),
// since both end in a `.show(` whose first argument is the literal "error".
function isErrorToastCall(node) {
  const callee = node.callee
  if (callee.type !== "MemberExpression" || callee.computed) return false
  if (callee.property.type !== "Identifier" || callee.property.name !== "show") return false
  return getStaticText(node.arguments[0]) === "error"
}

// The argument nodes holding what the user ends up reading - one for a setter, title + description
// for a toast. Everything else about the call (the "error" kind, a duration) is not a message.
function getMessageArguments(node) {
  if (isErrorSetterCall(node) || isHotToastErrorCall(node)) return node.arguments.slice(0, 1)
  if (isErrorToastCall(node)) return node.arguments.slice(1, 3)
  return null
}

// The FIRST half only - the line the user reads before anything else, and the one the ambiguous-noun
// check judges. Kept apart from getMessageArguments because a description is very often the runtime
// `error.message`, and joining the two would judge the title by text this rule never gets to read.
function getTitleArgument(node) {
  if (isErrorSetterCall(node) || isHotToastErrorCall(node)) return node.arguments[0]
  if (isErrorToastCall(node)) return node.arguments[1]
  return null
}

// `toast.show("error", "Failed to select AI move decisions", error.message)` - the description is
// whatever the runtime handed over ("Failed to fetch"), and the 4th argument that would hold a
// button is missing, so the user reads a raw reason with nothing to press. That is the exact toast
// he reported on 07.09.2026, and the 3 static checks below all skip it: filler/developer-term read
// the title only, and the next-step check bows out the moment any half is a runtime value.
//
// Answered by `{ isInfinite: true, actionButton: <RetryToastField label="..." onRetry={...} /> }` -
// RetryToastField already exists in app/components/shared/ and every "run that again" toast uses it.
// A wrong API key renders AIDecisionsVerificationEnvs instead; the rule asks for a button, never for
// a particular one.
function hasActionButtonOption(node) {
  const optionsArgument = node.arguments[3]
  if (!optionsArgument) return false
  // a variable or a call holding the options (getVerifyErrorToastOptionsFn(...)) is read as
  // answered - the rule has no way into it, and reporting it would punish the shape that extracts
  // this decision into its own named function
  if (optionsArgument.type !== "ObjectExpression") return true
  return optionsArgument.properties.some(
    property =>
      property.type === "SpreadElement" ||
      (property.key && !property.computed && property.key.type === "Identifier" && property.key.name === "actionButton"),
  )
}

// A description built out of a CAUGHT FAILURE - `error.message`, `error instanceof Error ? ... `,
// `selectDecisionsFnResp`, `response`. That is the shape with no move left in it: the call did not
// work, and the words come from a provider or the browser.
//
// Deliberately NOT every runtime description. `Image too big` passes `${sizeMB}MB` - a runtime value
// this rule equally has no way to read, but the user's move there is obvious (pick a smaller file)
// and no button would do it for them. Requiring one on those makes a rule nobody satisfies honestly.
// `resp`/`response` in any case - a bare lowercase `response` from an SDK method is the most common
// name for a returned error string in this codebase ("Could not prepare scrape", response)
const CAUGHT_FAILURE_NAME = /\berrors?\b|Resp\b|Response\b|\bresp(?:onse)?\b/

// `error.message`, `(error as Error).message`, `error instanceof Error ? error.message : String(error)`,
// `Not sent: ${error.message}` - the caught error's own text as the description. useToast only runs
// matchRuntimeError on `options.error`, so this text skips the reason table and the user reads the
// parser itself ("Unexpected end of JSON input"). A button next to it changes nothing about that,
// which is why this check runs whether an actionButton is there or not.
// A caught error = a catch clause's own parameter, or a name ending in "error" / "err" / "e".
const CAUGHT_ERROR_NAME = /^(?:e|err)$|error$/i

function isCaughtErrorIdentifier(node, sourceCode) {
  if (node.type !== "Identifier") return false
  if (CAUGHT_ERROR_NAME.test(node.name)) return true
  for (let scope = sourceCode.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get(node.name)
    if (variable) return variable.defs[0]?.type === "CatchClause"
  }
  return false
}

// `(error as Error)` / `error!` / `(error)` - the same value under a TS wrapper
function unwrapExpression(node) {
  let current = node
  while (current && (current.type === "TSAsExpression" || current.type === "TSNonNullExpression" || current.type === "TSTypeAssertion"))
    current = current.expression
  return current
}

// `error.message` or `String(error)` - the 2 ways a caught error turns into the text a toast shows
function isRawErrorText(node, sourceCode) {
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier" && node.property.name === "message")
    return isCaughtErrorIdentifier(unwrapExpression(node.object), sourceCode)
  if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "String" && node.arguments[0])
    return isCaughtErrorIdentifier(unwrapExpression(node.arguments[0]), sourceCode)
  return false
}

// Walks the description (a ternary, a template literal, a `??`) for the first raw error text. A
// function inside it is someone else's code, so the walk stops there.
function findRawErrorText(node, sourceCode) {
  if (!node || typeof node.type !== "string") return null
  if (isRawErrorText(node, sourceCode)) return node
  if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") return null
  for (const key of Object.keys(node)) {
    if (key === "parent") continue
    const children = Array.isArray(node[key]) ? node[key] : [node[key]]
    for (const child of children) {
      const rawErrorText = child && typeof child === "object" ? findRawErrorText(child, sourceCode) : null
      if (rawErrorText) return rawErrorText
    }
  }
  return null
}

// The description itself, or the `const errorMessage = error instanceof Error ? ...` it names - one
// step through a const, so moving the same text into a variable first still reaches the same answer
function findRawErrorDescription(descriptionArgument, sourceCode) {
  if (!descriptionArgument) return null
  if (descriptionArgument.type !== "Identifier") return findRawErrorText(descriptionArgument, sourceCode)
  for (let scope = sourceCode.getScope(descriptionArgument); scope; scope = scope.upper) {
    const variable = scope.set.get(descriptionArgument.name)
    if (!variable) continue
    const definitionNode = variable.defs[0]?.node
    const isConstDeclarator = definitionNode?.type === "VariableDeclarator" && definitionNode.parent?.kind === "const"
    return isConstDeclarator ? findRawErrorText(definitionNode.init, sourceCode) : null
  }
  return null
}

// True when the reason the user reads is a caught failure - so the message itself is decided at
// runtime, and an empty/absent description is a different problem the static checks already cover.
function hasCaughtFailureDescription(node, sourceCode) {
  const descriptionArgument = node.arguments[2]
  if (!descriptionArgument || getStaticText(descriptionArgument) !== null) return false
  if (descriptionArgument.type === "Identifier" && isSyncCallResult(descriptionArgument, sourceCode)) return false
  return CAUGHT_FAILURE_NAME.test(sourceCode.getText(descriptionArgument))
}

// `const response = validateDomain(domainValue)` - a sync validator's own message about what the user
// typed, the input on screen is the move. Only a value an `await` or a `catch` handed over is a failure
function isSyncCallResult(identifierNode, sourceCode) {
  for (let scope = sourceCode.getScope(identifierNode); scope; scope = scope.upper) {
    const variable = scope.set.get(identifierNode.name)
    if (variable) return variable.defs[0]?.node?.init?.type === "CallExpression"
  }
  return false
}

function findDeveloperTerm(lowercasedText, rawText) {
  const term = DEVELOPER_TERMS.find(developerTerm => new RegExp(`\\b${developerTerm}\\b`).test(lowercasedText))
  if (term) return term
  const unquotedText = rawText.replace(QUOTED_VALUE, " ")
  const identifierMatch = ENV_VAR_IDENTIFIER.exec(unquotedText) || CAMEL_CASE_IDENTIFIER.exec(unquotedText)
  return identifierMatch ? identifierMatch[0] : null
}

// The noun fires only when no qualifier sits anywhere in the message - "Error accepting AI move
// decision" and "Move decision not accepted" both pass, so the fix is adding the word, not reshaping
// the sentence.
function findAmbiguousNoun(lowercasedText) {
  const hasQualifier = AMBIGUOUS_NOUN_QUALIFIERS.some(word => new RegExp(`\\b${word}\\b`).test(lowercasedText))
  if (hasQualifier) return null
  return AMBIGUOUS_NOUNS.find(noun => new RegExp(`\\b${noun}s?\\b`).test(lowercasedText)) ?? null
}

function hasNextStep(lowercasedText) {
  const userFacingText = lowercasedText.replace(SYSTEM_ACTION_PHRASE, " ")
  return NEXT_STEP_WORDS.some(word => new RegExp(`\\b${word}\\b`).test(userFacingText))
}

// Long messages get cut in the report itself - the point of quoting the text back is recognizing
// WHICH message is meant, and the first 70 characters already do that.
function forReport(text) {
  return text.length > 70 ? `${text.slice(0, 70)}...` : text
}

module.exports = {
  "no-vague-error-msg": {
    meta: {
      type: "problem",
      docs: {
        description: "require a user-facing error message to name what failed, what it cost the user, and what to do now",
      },
      schema: [],
      messages: {
        fillerMessage:
          'Error message "{{text}}" shows nothing the user can act on - name what failed, what they lost, and what to do now (e.g. "Internet connection lost - I retried 2 times (10 s and 20 s apart). Emails not fetched - contact support").',
        developerTerm:
          'Error message "{{text}}" shows "{{term}}" - a word out of the code, not out of the user\'s world. Rewrite it in what they see on screen (e.g. "Internet connection lost - I retried 2 times (10 s and 20 s apart). Emails not fetched - contact support").',
        noSelfRetry:
          'Error message "{{text}}" hands the user "{{phrase}}" - waiting and running it again is the code\'s job. Retry it in the code first (2 times, 10 s then 20 s), then show that it did: "I retried 2 times - 10 s and 20 s apart - still <error.message>".',
        noNextStep:
          'Error message "{{text}}" never shows what to do next - end it with the step out: reload the page, contact support, or the exact value to enter.',
        ambiguousNoun:
          'Error message "{{text}}" says "{{noun}}" without saying which kind - this codebase has several (move, reply, blast, scraping). Name it, e.g. "Error accepting AI move decision".',
        rawErrorMessage:
          'Error toast "{{text}}" shows the caught error\'s own text ({{rawErrorText}}) - "Unexpected end of JSON input" reaches the screen as it is, and matchRuntimeError never gets to explain it. Hand over the error itself: toast.show("error", "{{text}}", undefined, { error, onRetry: theSameCall }) - useToast shows what it means + the raw text in brackets, and draws "Try again". Words around the error move into the title; a field the user fills (a key, a login) moves from actionButton to credentialsField; no onRetry when running it again makes no sense (a delete that already went through).',
        noActionButton:
          'Error toast "{{text}}" hands the user whatever the runtime answered ("Failed to fetch", a timeout, "no API key configured") and nothing to press. Offer the solution right there: a failure on our side -> toast.show("error", "{{text}}", undefined, { error: response, onRetry: theSameCall }) - useToast translates the reason and renders the retry button, no JSX needed; a missing setting the user can fill (API key, model, prompt, envs) -> toast.show("warning", "{{text}}", response, { isInfinite: true, actionButton: <TheFieldItself /> }) (see ScrapeSettingsToastField.tsx).{{tsxHint}}',
      },
    },
    create(context) {
      const filename = context.filename ?? context.getFilename()
      // an actionButton is a real component - a .ts hook can only pass it via React.createElement(...),
      // which is the exact workaround his own words rejected (09.09.2026): "you don't need to
      // createElement - just use useAutoUpdateHunterLoginCredentials.tsx ... I don't prefer to use
      // createElement". Renaming the hook to .tsx and writing real JSX is the fix, not the wrapper.
      const tsxHint = /\.ts$/.test(filename)
        ? " This file is .ts - the onRetry shape needs no JSX; a field in actionButton means renaming it to .tsx (<Component />), never React.createElement(...)."
        : ""

      return {
        CallExpression(node) {
          const messageArguments = getMessageArguments(node)
          if (!messageArguments || messageArguments.length === 0) return

          // Every readable half, plus whether any half is a runtime value. An empty string is a
          // reset (setErrorMessage("") clears the error state), not a message - it counts as
          // neither, so clearing the state stays silent.
          const staticParts = []
          let hasRuntimePart = false
          for (const messageArgument of messageArguments) {
            const staticText = getStaticText(messageArgument)
            if (staticText === null) hasRuntimePart = true
            else if (staticText.trim().length > 0) staticParts.push({ node: messageArgument, text: staticText.trim() })
          }

          // runs before the static-text return below - `toast.show("error", title, error.message)` with a
          // runtime title is still the same raw text on screen
          const rawErrorText = isErrorToastCall(node) ? findRawErrorDescription(node.arguments[2], context.sourceCode) : null
          const reportRawErrorMessage = titleText =>
            context.report({
              node: node.arguments[2],
              messageId: "rawErrorMessage",
              data: {
                text: forReport(titleText ?? context.sourceCode.getText(node.arguments[1])),
                // the whole description as written - a ternary reads as the line in the file, not 1 half of it
                rawErrorText: forReport(
                  context.sourceCode.getText(node.arguments[2].type === "Identifier" ? rawErrorText : node.arguments[2]),
                ),
              },
            })
          if (staticParts.length === 0) {
            if (rawErrorText) reportRawErrorMessage(null)
            return
          }

          const text = staticParts.map(part => part.text).join(" ")
          const lowercasedText = text.toLowerCase()
          const reportNode = staticParts[0].node

          const isWholeMessageFiller = FILLER_WHOLE_MESSAGES.has(lowercasedText.replace(/[.!\s]+$/, ""))
          if (isWholeMessageFiller || FILLER_PHRASES.some(phrase => phrase.test(lowercasedText))) {
            return context.report({ node: reportNode, messageId: "fillerMessage", data: { text: forReport(text) } })
          }

          const developerTerm = findDeveloperTerm(lowercasedText, text)
          if (developerTerm) {
            return context.report({ node: reportNode, messageId: "developerTerm", data: { text: forReport(text), term: developerTerm } })
          }

          // the static halves only - a runtime half could hold the "I retried" part, but the "try again" this
          // reads sits in text written right here
          const tryAgainPhrase = findTryAgainPhrase(lowercasedText)
          if (tryAgainPhrase) {
            return context.report({ node: reportNode, messageId: "noSelfRetry", data: { text: forReport(text), phrase: tryAgainPhrase } })
          }

          // Title only, and only a fully static one: `No ${decisionLabel}s updated` already names the
          // kind in the half this rule reads as empty, so judging it would report a word that IS there.
          const titleText = getStaticText(getTitleArgument(node))
          const ambiguousNoun = titleText ? findAmbiguousNoun(titleText.toLowerCase()) : null
          if (ambiguousNoun) {
            return context.report({
              node: reportNode,
              messageId: "ambiguousNoun",
              data: { text: forReport(titleText.trim()), noun: ambiguousNoun },
            })
          }

          // The next-step check needs the WHOLE message in hand - when half of it is a runtime
          // value, the step out could be sitting in the half this rule never gets to read. What CAN
          // be checked there is whether a button was handed over at all: a raw runtime reason with
          // nothing to press is the one shape that leaves the user with no move (07.09.2026,
          // "Failed to select AI move decisions / Failed to fetch")
          if (hasRuntimePart) {
            // before noActionButton - one call site, one message, and the { error } shape answers both
            if (rawErrorText) return reportRawErrorMessage(titleText ? titleText.trim() : text)
            if (isErrorToastCall(node) && hasCaughtFailureDescription(node, context.sourceCode) && !hasActionButtonOption(node))
              context.report({
                node: reportNode,
                messageId: "noActionButton",
                data: { text: forReport(titleText ? titleText.trim() : text), tsxHint },
              })
            return
          }
          if (!hasNextStep(lowercasedText)) {
            context.report({ node: reportNode, messageId: "noNextStep", data: { text: forReport(text) } })
          }
        },
      }
    },
  },
}
