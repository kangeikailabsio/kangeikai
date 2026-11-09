<script lang='ts'>
  import type { Snippet } from 'svelte'

  const { title, children, footer }: { title: string, children: Snippet, footer: Snippet } = $props()
</script>

<svelte:head>
  <title>{title} — Kangeikai</title>
  <meta name='robots' content='noindex' />
</svelte:head>

<div class='page'>
  <a class='brand' href='/'>Kangeikai</a>
  <main class='card'>
    <h1>{title}</h1>
    {@render children()}
  </main>
  <p class='footer'>{@render footer()}</p>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    min-height: 100dvh;
    padding: 24px 16px;
    background: #1a1a1a;
    color: #fff;
  }

  .brand {
    color: #fff;
    font-size: 18px;
    font-weight: 700;
    text-decoration: none;
  }

  .brand:hover {
    text-decoration: underline;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 380px;
    max-width: 100%;
    padding: 24px;
    border-radius: 12px;
    background: #262626;
  }

  h1 {
    font-size: 20px;
  }

  .footer {
    color: #9ca3af;
    font-size: 14px;
  }

  .footer :global(a) {
    color: #93c5fd;
  }

  .brand:focus-visible,
  .footer :global(a:focus-visible) {
    outline: 2px solid #93c5fd;
    outline-offset: 2px;
  }
</style>
