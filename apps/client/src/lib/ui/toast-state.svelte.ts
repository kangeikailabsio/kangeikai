/** How long a toast stays visible before auto-dismissing. */
const TOAST_DURATION_MS = 2500

/**
 * Single active toast — not a queue. A new `show()` replaces whatever is currently displayed and
 * restarts the dismiss timer, rather than stacking (#92): repeated invalid clicks, e.g. tapping
 * against a wall, just keep one message alive instead of piling up a growing list.
 */
function createToastState() {
  let message = $state<string | undefined>()
  let dismissTimer: ReturnType<typeof setTimeout> | undefined

  return {
    get message(): string | undefined {
      return message
    },
    show(text: string): void {
      message = text
      clearTimeout(dismissTimer)
      dismissTimer = setTimeout(() => {
        message = undefined
      }, TOAST_DURATION_MS)
    },
  }
}

export const toastState = createToastState()
