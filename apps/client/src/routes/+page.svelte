<script lang='ts'>
  import { FEATURES, GITHUB_URL, HERO, LICENSE_URL, STEPS } from '$lib/landing/landing-content'
  import LandingMedia from '$lib/landing/landing-media.svelte'

  const title = 'Kangeikai — a virtual office you can walk around in'
  const description = 'Open-source virtual office: move your avatar across a shared 2D map and talk by voice and video to whoever is nearby.'
</script>

<svelte:head>
  <title>{title}</title>
  <meta name='description' content={description} />
  <meta property='og:type' content='website' />
  <meta property='og:title' content={title} />
  <meta property='og:description' content={description} />
  <meta name='twitter:card' content='summary' />
</svelte:head>

<div class='landing'>
  <header class='bar'>
    <a class='brand' href='/'>Kangeikai</a>
    <nav class='actions' aria-label='Account'>
      <a class='button ghost' href='/sign-in'>Sign in</a>
      <a class='button primary' href='/sign-up'>Sign up</a>
    </nav>
  </header>

  <main>
    <section class='hero'>
      <h1>{HERO.headline}</h1>
      <p class='lead'>{HERO.subheadline}</p>
      <div class='cta'>
        <a class='button primary large' href='/sign-up'>Sign up</a>
        <a class='button ghost large' href='/sign-in'>Sign in</a>
      </div>
      <div class='hero-media'>
        <LandingMedia media={HERO.media} />
      </div>
    </section>

    <section class='section' aria-labelledby='features-title'>
      <h2 id='features-title'>Everything you need to feel in the same room</h2>
      <ul class='features'>
        {#each FEATURES as feature (feature.id)}
          <li class='feature'>
            <LandingMedia media={feature.media} />
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </li>
        {/each}
      </ul>
    </section>

    <section class='section' aria-labelledby='how-title'>
      <h2 id='how-title'>How it works</h2>
      <ol class='steps'>
        {#each STEPS as step}
          <li>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </li>
        {/each}
      </ol>
    </section>

    <section class='section final' aria-labelledby='final-title'>
      <h2 id='final-title'>Ready to step in?</h2>
      <div class='cta'>
        <a class='button primary large' href='/sign-up'>Sign up</a>
        <a class='button ghost large' href='/sign-in'>Sign in</a>
      </div>
    </section>
  </main>

  <footer class='footer'>
    <span>歓迎会 · Kangeikai</span>
    <span class='links'>
      <a href={GITHUB_URL}>GitHub</a>
      <a href={LICENSE_URL}>AGPL-3.0</a>
    </span>
  </footer>
</div>

<style>
  .landing {
    min-height: 100dvh;
    background: #1a1a1a;
    color: #fff;
  }

  .bar,
  main,
  .footer {
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
    padding-right: 16px;
    padding-left: 16px;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 16px;
    padding-bottom: 16px;
  }

  .brand {
    color: #fff;
    font-size: 18px;
    font-weight: 700;
    text-decoration: none;
  }

  .actions,
  .cta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .button {
    display: inline-block;
    padding: 8px 16px;
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
  }

  .button.large {
    padding: 12px 24px;
    font-size: 16px;
  }

  .button.primary {
    background: #3b82f6;
    color: #fff;
  }

  .button.primary:hover {
    background: #2563eb;
  }

  .button.ghost {
    border-color: #4a4a4a;
    color: #fff;
  }

  .button.ghost:hover {
    background: #262626;
  }

  .button:focus-visible,
  .brand:focus-visible,
  .links a:focus-visible {
    outline: 2px solid #93c5fd;
    outline-offset: 2px;
  }

  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 48px 0 32px;
    text-align: center;
  }

  h1 {
    max-width: 18ch;
    font-size: clamp(32px, 6vw, 56px);
    line-height: 1.1;
  }

  .lead {
    max-width: 60ch;
    color: #d1d5db;
    font-size: clamp(16px, 2.4vw, 20px);
    line-height: 1.5;
  }

  .hero .cta {
    justify-content: center;
  }

  .hero-media {
    width: 100%;
    max-width: 880px;
    margin-top: 16px;
  }

  .section {
    padding: 48px 0;
  }

  h2 {
    margin-bottom: 32px;
    font-size: clamp(24px, 4vw, 32px);
    text-align: center;
  }

  h3 {
    margin: 12px 0 6px;
    font-size: 18px;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: 32px 24px;
    list-style: none;
  }

  .feature p,
  .steps p {
    color: #d1d5db;
    line-height: 1.5;
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
    gap: 24px;
    padding-left: 0;
    counter-reset: step;
    list-style: none;
  }

  .steps li {
    padding: 20px;
    border-radius: 12px;
    background: #262626;
    counter-increment: step;
  }

  .steps li::before {
    content: counter(step);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #3b82f6;
    font-size: 14px;
    font-weight: 700;
  }

  .final {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .final h2 {
    margin-bottom: 20px;
  }

  .footer {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding-top: 24px;
    padding-bottom: 32px;
    border-top: 1px solid #333;
    color: #9ca3af;
    font-size: 14px;
  }

  .links {
    display: flex;
    gap: 16px;
  }

  .links a {
    color: #d1d5db;
  }
</style>
