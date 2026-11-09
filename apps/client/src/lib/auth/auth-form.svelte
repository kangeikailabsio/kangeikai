<script lang='ts'>
  import type { Snippet } from 'svelte'
  import GoogleButton from '$lib/auth/google-button.svelte'

  interface Props {
    submitLabel: string
    pendingLabel: string
    /** Shown while a request is in flight; the integration issue (#232) drives it. */
    pending?: boolean
    /** A server-side failure to show above the button; the integration issue (#232) drives it. */
    formError?: string
    onsubmit: () => void
    ongoogle?: () => void
    fields: Snippet
  }

  const { submitLabel, pendingLabel, pending = false, formError = '', onsubmit, ongoogle, fields }: Props = $props()
</script>

<form
  novalidate
  onsubmit={(event) => {
    event.preventDefault()
    onsubmit()
  }}
>
  {@render fields()}

  {#if formError}
    <p class='form-error' role='alert'>{formError}</p>
  {/if}

  <button class='submit' type='submit' disabled={pending}>
    {#if pending}
      <span class='spinner' aria-hidden='true'></span>
      {pendingLabel}
    {:else}
      {submitLabel}
    {/if}
  </button>
</form>

<div class='divider' aria-hidden='true'><span>or</span></div>

<GoogleButton onclick={ongoogle} disabled={pending} />

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .form-error {
    padding: 10px 12px;
    border-radius: 6px;
    background: rgb(248 113 113 / 12%);
    color: #fca5a5;
    font-size: 13px;
  }

  .submit {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
    border: 0;
    border-radius: 6px;
    background: #3b82f6;
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
  }

  .submit:hover:not(:disabled) {
    background: #2563eb;
  }

  .submit:focus-visible {
    outline: 2px solid #93c5fd;
    outline-offset: 2px;
  }

  .submit:disabled {
    cursor: not-allowed;
    opacity: 0.8;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgb(255 255 255 / 40%);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 2.4s;
    }
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #9ca3af;
    font-size: 12px;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #3a3a3a;
  }
</style>
