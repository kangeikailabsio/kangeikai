<script lang='ts'>
  import AuthField from '$lib/auth/auth-field.svelte'
  import { validateSignIn } from '$lib/auth/auth-form'
  import AuthForm from '$lib/auth/auth-form.svelte'
  import AuthPage from '$lib/auth/auth-page.svelte'
  import { SIGN_UP_PATH } from '$lib/auth/auth-routes'

  let email = $state('')
  let password = $state('')
  let errors = $state<{ email?: string, password?: string }>({})

  function submit() {
    const result = validateSignIn({ email, password })
    errors = result.ok ? {} : result.errors
  // TODO(#232): on `result.ok`, call the auth client and go to POST_AUTH_PATH.
  }
</script>

<AuthPage title='Sign in'>
  <AuthForm submitLabel='Sign in' pendingLabel='Signing in…' onsubmit={submit}>
    {#snippet fields()}
      <AuthField id='email' label='Email' type='email' autocomplete='email' bind:value={email} error={errors.email} />
      <AuthField id='password' label='Password' type='password' autocomplete='current-password' bind:value={password} error={errors.password} />
    {/snippet}
  </AuthForm>

  {#snippet footer()}
    New here? <a href={SIGN_UP_PATH}>Sign up</a>
  {/snippet}
</AuthPage>
