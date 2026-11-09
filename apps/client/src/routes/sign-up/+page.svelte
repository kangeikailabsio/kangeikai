<script lang='ts'>
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { authClient } from '$lib/auth/auth-client'
  import AuthField from '$lib/auth/auth-field.svelte'
  import { describeAuthError, describeOAuthError, MIN_PASSWORD_LENGTH, validateSignUp } from '$lib/auth/auth-form'
  import AuthForm from '$lib/auth/auth-form.svelte'
  import AuthPage from '$lib/auth/auth-page.svelte'
  import { POST_AUTH_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from '$lib/auth/auth-routes'
  import { onMount } from 'svelte'

  let name = $state('')
  let email = $state('')
  let password = $state('')
  let errors = $state<{ name?: string, email?: string, password?: string }>({})
  // Set when a Google sign in failed and better-auth sent the person back here with `?error=`.
  let formError = $state(describeOAuthError(page.url.searchParams.get('error')))
  let pending = $state(false)

  // Already signed in: nothing to do here. A failed lookup (server down) just shows the form.
  onMount(async () => {
    try {
      const { data } = await authClient.getSession()
      if (data?.session)
        await goto(POST_AUTH_PATH, { replaceState: true })
    }
    catch {}
  })

  async function submit() {
    formError = ''
    const result = validateSignUp({ name, email, password })
    errors = result.ok ? {} : result.errors
    if (!result.ok)
      return

    pending = true
    try {
      const { error } = await authClient.signUp.email(result.value)
      if (error)
        formError = describeAuthError(error)
      else
        await goto(POST_AUTH_PATH)
    }
    catch (error) {
      formError = describeAuthError(error)
    }
    finally {
      pending = false
    }
  }

  async function continueWithGoogle() {
    formError = ''
    pending = true
    try {
      // Absolute: the OAuth round trip finishes on the server's origin, which then redirects back.
      const callbackURL = new URL(POST_AUTH_PATH, window.location.origin).href
      const errorCallbackURL = new URL(SIGN_UP_PATH, window.location.origin).href
      const { error } = await authClient.signIn.social({ provider: 'google', callbackURL, newUserCallbackURL: callbackURL, errorCallbackURL })
      if (error)
        formError = describeAuthError(error)
    }
    catch (error) {
      formError = describeAuthError(error)
    }
    finally {
      pending = false
    }
  }
</script>

<AuthPage title='Sign up'>
  <AuthForm submitLabel='Create account' pendingLabel='Creating account…' {pending} {formError} onsubmit={submit} ongoogle={continueWithGoogle}>
    {#snippet fields()}
      <AuthField id='name' label='Name' autocomplete='name' bind:value={name} error={errors.name} disabled={pending} />
      <AuthField id='email' label='Email' type='email' autocomplete='email' bind:value={email} error={errors.email} disabled={pending} />
      <AuthField id='password' label='Password' type='password' autocomplete='new-password' bind:value={password} error={errors.password} disabled={pending} hint='At least {MIN_PASSWORD_LENGTH} characters' />
    {/snippet}
  </AuthForm>

  {#snippet footer()}
    Already have an account? <a href={SIGN_IN_PATH}>Sign in</a>
  {/snippet}
</AuthPage>
