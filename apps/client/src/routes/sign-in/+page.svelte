<script lang='ts'>
  import { goto } from '$app/navigation'
  import { authClient } from '$lib/auth/auth-client'
  import AuthField from '$lib/auth/auth-field.svelte'
  import { describeAuthError, validateSignIn } from '$lib/auth/auth-form'
  import AuthForm from '$lib/auth/auth-form.svelte'
  import AuthPage from '$lib/auth/auth-page.svelte'
  import { POST_AUTH_PATH, SIGN_UP_PATH } from '$lib/auth/auth-routes'
  import { onMount } from 'svelte'

  let email = $state('')
  let password = $state('')
  let errors = $state<{ email?: string, password?: string }>({})
  let formError = $state('')
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
    const result = validateSignIn({ email, password })
    errors = result.ok ? {} : result.errors
    if (!result.ok)
      return

    pending = true
    try {
      const { error } = await authClient.signIn.email(result.value)
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
      const { error } = await authClient.signIn.social({ provider: 'google', callbackURL })
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

<AuthPage title='Sign in'>
  <AuthForm submitLabel='Sign in' pendingLabel='Signing in…' {pending} {formError} onsubmit={submit} ongoogle={continueWithGoogle}>
    {#snippet fields()}
      <AuthField id='email' label='Email' type='email' autocomplete='email' bind:value={email} error={errors.email} disabled={pending} />
      <AuthField id='password' label='Password' type='password' autocomplete='current-password' bind:value={password} error={errors.password} disabled={pending} />
    {/snippet}
  </AuthForm>

  {#snippet footer()}
    New here? <a href={SIGN_UP_PATH}>Sign up</a>
  {/snippet}
</AuthPage>
