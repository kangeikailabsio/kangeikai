/**
 * The persistent "{Name} says hello 👋" toast (issue #157) — unlike `toastState`, this never
 * auto-dismisses; only `dismiss()` (the toast's own "×" button) clears it. A new hello replaces
 * whatever's currently shown rather than queuing (#157's grill: one active at a time).
 */
function createHelloToastState() {
  let fromDisplayName = $state<string | undefined>(undefined)

  return {
    get fromDisplayName(): string | undefined {
      return fromDisplayName
    },
    show(name: string): void {
      fromDisplayName = name
    },
    dismiss(): void {
      fromDisplayName = undefined
    },
  }
}

export const helloToastState = createHelloToastState()
