/**
 * Placeholder screen for core areas whose features arrive in later milestones.
 * Keeps the app shell navigable end to end before the real screens exist.
 */
export function Stub ({ title, blurb }: { title: string, blurb: string }) {
  return (
    <div className='app-page'>
      <header className='app-hero'>
        <a className='app-brand' href='/' aria-label='Second Brain home'>
          <img src='/design/assets/logo-mark-invert.svg' alt='' />
          <span className='app-wordmark'>Second Brain</span>
        </a>
        <p className='app-kicker'>Private console</p>
        <h1 className='app-title' data-testid='stub-title'>{title}</h1>
        <p className='app-tagline'>{blurb}</p>
      </header>
      <main className='action-card'>
        <div className='alert alert-info' role='status'>
          <span className='alert-title'>Coming soon</span>
          <span>This screen arrives in a later milestone.</span>
        </div>
      </main>
    </div>
  )
}
