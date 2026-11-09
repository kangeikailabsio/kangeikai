<script lang='ts'>
  import AuthField from '$lib/auth/auth-field.svelte'
  import { MIN_PASSWORD_LENGTH, validateSignUp } from '$lib/auth/auth-form'
  import AuthForm from '$lib/auth/auth-form.svelte'
  import AuthPage from '$lib/auth/auth-page.svelte'
  import { SIGN_IN_PATH } from '$lib/auth/auth-routes'

  let name = $state('')
  let email = $state('')
  let password = $state('')
  let errors = $state<{ name?: string, email?: string, password?: string }>({})

  function submit() {
    const result = validateSignUp({ name, email, password })
    errors = result.ok ? {} : result.errors
  // TODO(#232): on `result.ok`, call the auth client and go to POST_AUTH_PATH.
  }
</script>

<AuthPage title='Sign up'>
  <AuthForm submitLabel='Create account' pendingLabel='Creating account…' onsubmit={submit}>
    {#snippet fields()}
      <AuthField id='name' label='Name' autocomplete='name' bind:value={name} error={errors.name} />
      <AuthField id='email' label='Email' type='email' autocomplete='email' bind:value={email} error={errors.email} />
      <AuthField id='password' label='Password' type='password' autocomplete='new-password' bind:value={password} error={errors.password} hint='At least {MIN_PASSWORD_LENGTH} characters' />
    {/snippet}
  </AuthForm>

  {#snippet footer()}
    Already have an account? <a href={SIGN_IN_PATH}>Sign in</a>
  {/snippet}
</AuthPage>
