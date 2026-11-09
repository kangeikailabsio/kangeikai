<script lang='ts'>
  interface Props {
    id: string
    label: string
    type?: 'text' | 'email' | 'password'
    autocomplete: 'name' | 'email' | 'current-password' | 'new-password'
    value: string
    error?: string
    disabled?: boolean
    hint?: string
  }

  let { id, label, type = 'text', autocomplete, value = $bindable(), error, disabled = false, hint }: Props = $props()

  const describedBy = $derived([error ? `${id}-error` : undefined, hint ? `${id}-hint` : undefined].filter(Boolean).join(' ') || undefined)
</script>

<div class='field'>
  <label for={id}>{label}</label>
  <input {id} {type} {autocomplete} {disabled} bind:value aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} />
  {#if hint && !error}
    <span class='hint' id='{id}-hint'>{hint}</span>
  {/if}
  {#if error}
    <span class='error' id='{id}-error'>{error}</span>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    font-size: 14px;
  }

  input {
    padding: 10px 12px;
    border: 1px solid #4a4a4a;
    border-radius: 6px;
    background: #1a1a1a;
    color: #fff;
    font: inherit;
    font-size: 14px;
  }

  input:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 1px;
  }

  input[aria-invalid='true'] {
    border-color: #f87171;
  }

  input:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .hint {
    color: #9ca3af;
    font-size: 12px;
  }

  .error {
    color: #fca5a5;
    font-size: 12px;
  }
</style>
