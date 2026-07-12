interface AppHeroProps {
  title: string
  tagline: string
  kicker?: string
  narrow?: boolean
  titleTestId?: string
}

export function AppHero ({ title, tagline, kicker = 'Private console', narrow = false, titleTestId }: AppHeroProps) {
  return (
    <header className={`app-hero${narrow ? ' narrow' : ''}`}>
      <a className='app-brand' href='/' aria-label='Second Brain home'>
        <img src='/design/assets/logo-mark-invert.svg' alt='' />
        <span className='app-wordmark'>Second Brain</span>
      </a>
      <p className='app-kicker'>{kicker}</p>
      <h1 className='app-title' data-testid={titleTestId}>{title}</h1>
      <p className='app-tagline'>{tagline}</p>
    </header>
  )
}
