<script lang='ts'>
  import favicon from '$lib/assets/favicon.svg'

  // Supports weights 100-900
  import '@fontsource-variable/roboto/wght.css'

  import '../app.css'

  const { children } = $props()
</script>

<svelte:head>
  <link rel='icon' href={favicon} />
</svelte:head>

{@render children()}
