import { AppHero } from './AppHero.js'

/**
 * Placeholder screen for core areas whose features arrive in later milestones.
 * Keeps the app shell navigable end to end before the real screens exist.
 */
export function Stub ({ title, blurb }: { title: string, blurb: string }) {
  return (
    <div className='app-page'>
      <AppHero title={title} tagline={blurb} titleTestId='stub-title' />
      <main className='action-card'>
        <div className='alert alert-info' role='status'>
          <span className='alert-title'>Coming soon</span>
          <span>This screen arrives in a later milestone.</span>
        </div>
      </main>
    </div>
  )
}
