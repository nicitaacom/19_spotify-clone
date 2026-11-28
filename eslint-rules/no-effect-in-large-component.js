"use strict"

const { isComponentFile } = require("./utils/isComponentFile")

// A component should do rendering only - side effects live in a useSetXxx/useAutoUpdateXxx hook,
// not directly in the component. Exception: a component under ~100 lines is small enough that
// extracting a hook for it isn't worth the indirection. Detected by the same filename+JSX
// heuristic as no-type-export-in-action-or-component's isComponentFile: a .tsx file with a
// PascalCase basename that returns JSX.
//
// Bad (150-line component):
//   useEffect(() => { document.title = subject }, [subject])
// Good:
//   useAutoUpdateDocumentTitle(subject) // the effect lives in its own hook
const LINE_EXCEPTION_THRESHOLD = 100
const EFFECT_HOOK_NAMES = new Set(["useEffect", "useLayoutEffect"])

// A second, independent exception: a useEffect/useLayoutEffect call itself spanning up to 7 lines is
// small enough that extracting a hook for it is pure indirection, the same reasoning the
// LINE_EXCEPTION_THRESHOLD already applies at the component level, just applied at the call's own
// size instead. One-line synchronization effects also occur in this repository and are small.
const SMALL_EFFECT_MAX_LINES = 7

function isSmallEffectCall(node) {
  const lineSpan = node.loc.end.line - node.loc.start.line + 1
  return lineSpan <= SMALL_EFFECT_MAX_LINES
}

// Exception list: components whose effects are essential (DOM/canvas/terminal state machines,
// mount-sequencing) where splitting into a hook would just relocate code without a real separation-
// of-concerns win, and makes the logic harder to follow. Matched against the end of the file path,
// so both "/app/..." absolute paths and repo-relative paths work.
const EXCEPTION_FILE_PATHS = [
  // Animation and playback state machines keep their tightly coupled refs and cleanup together.
  "/app/(site)/8d-generator/components/SpeakerRing.tsx",
  "/app/(site)/slow-and-reverb/components/AlbumArt.tsx",
  "/app/(site)/slow-and-reverb/components/Waveform.tsx",
  "/app/providers/PlaybackSyncProvider.tsx",
  "/components/PlayerContent.tsx",
  "/components/auth/OrganicCanvasBackground.tsx",
  "/app/modules/EmailBodySection/EmailBodySection.tsx",
  "/app/components/FileImagePreview.tsx",
  "/app/components/shared/InputBubbles.tsx",
  "/app/modules/Screens/LambdaSetupScreen/components/LambdaTerminal.tsx",
  "/app/(routes)/scraper/modules/RightSection/ScrapingTaskCard.tsx",
  "/app/modules/EnvWrapper/MountingScreen/MountingScreen.tsx",
  "/app/modules/EnvWrapper/EnvWrapper.tsx",
  "/app/components/Providers/ModalsProvider.tsx",
  "/app/modules/Screens/LambdaSetupScreen/LambdaSetupScreen.tsx",
  "/app/modules/AreYouSureModals/DeleteEmailAccountModal/EADeletionConfirmation.tsx",
  "/app/modules/Modals/FollowUpModal/FollowUpModal.tsx",
  "/app/widgets/CronSchedules/components/CronScheduleEditor.tsx",
  "/app/widgets/ModalContainers/ModalContainer.tsx",
  "/app/modules/Modals/AccountModal/AccountTabs/AccountSettingsTab/components/RequestLengthProgressbar.tsx",
  "/app/modules/Modals/FollowUpModal/FixedChildrenBottom/CreateFollowUpButton/DeliverabilityToastContent.tsx",
]

// Exception as a class: any *Widget.tsx file. A widget is the top-level composition root for its
// feature (stores + handlers + sub-components all wired together here) - its effects are almost
// always essential plumbing for that composition, not a stray side effect that
// slipped into an otherwise-pure render function.
function isWidgetFile(filename) {
  return /Widget\.tsx$/.test(filename)
}

function isExceptionFile(filename) {
  return isWidgetFile(filename) || EXCEPTION_FILE_PATHS.some(path => filename.endsWith(path))
}

function isInsideCustomHook(node) {
  let parent = node.parent
  while (parent) {
    if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(parent.type)) {
      const name = parent.id?.name ?? (parent.parent?.type === "VariableDeclarator" ? parent.parent.id.name : "")
      return /^use[A-Z]/.test(name ?? "")
    }
    parent = parent.parent
  }
  return false
}

module.exports = {
  "no-effect-in-large-component": {
    meta: {
      type: "problem",
      docs: {
        description:
          "disallow useEffect/useLayoutEffect in a component file over ~100 lines - side effects belong in a useSetXxx/useAutoUpdateXxx hook, unless the effect call is at most 7 lines",
      },
      schema: [],
      messages: {
        noEffectInLargeComponent:
          'This component file is {{lineCount}} lines (over the {{threshold}}-line exception) and calls "{{name}}" directly - move this side effect into a useSetXxx/useAutoUpdateXxx hook instead. Components should do rendering only.',
      },
    },
    create(context) {
      const filename = context.filename ?? context.getFilename()
      if (isExceptionFile(filename)) return {}
      const sourceCode = context.sourceCode ?? context.getSourceCode()
      if (!isComponentFile(filename, sourceCode)) return {}

      const lineCount = sourceCode.lines.length
      if (lineCount < LINE_EXCEPTION_THRESHOLD) return {}

      return {
        CallExpression(node) {
          if (node.callee.type !== "Identifier" || !EFFECT_HOOK_NAMES.has(node.callee.name)) return
          if (isSmallEffectCall(node) || isInsideCustomHook(node)) return
          context.report({
            node,
            messageId: "noEffectInLargeComponent",
            data: { name: node.callee.name, lineCount, threshold: LINE_EXCEPTION_THRESHOLD },
          })
        },
      }
    },
  },
}
