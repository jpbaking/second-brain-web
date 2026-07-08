import './app-shell.css'
import type { ReactNode } from 'react'

/**
 * Authenticated app shell: a sticky top navigation on desktop and a fixed
 * bottom navigation on mobile, across the core screens, wrapping the routed
 * page content. Login and the setup page are not wrapped.
 */

interface NavItem { href: string, label: string, short: string }

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Command centre', short: 'Home' },
  { href: '/chat', label: 'Chat', short: 'Chat' },
  { href: '/follow-ups', label: 'Follow-ups', short: 'Queue' },
  { href: '/reports', label: 'Reports', short: 'Reports' },
  { href: '/vault', label: 'Vault', short: 'Vault' },
]

function isActive (path: string, href: string): boolean {
  return href === '/' ? path === '/' : path.startsWith(href)
}

async function logout (): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
  window.location.assign('/login')
}

export function AppShell ({ path, children }: { path: string, children: ReactNode }) {
  return (
    <>
      <div className='nav-wrap'>
        <div className='container'>
          <nav className='nav' aria-label='Primary'>
            <a className='brand' href='/'>
              <img src='/design/assets/logo-mark.svg' alt='' />
              <span className='brand-name'>Second Brain</span>
            </a>
            <div className='nav-right'>
              <ul className='nav-links app-nav-links'>
                {NAV_ITEMS.map((item) => (
                  <li key={item.href}>
                    <a
                      className={isActive(path, item.href) ? 'nav-link active' : 'nav-link'}
                      href={item.href}
                      aria-current={isActive(path, item.href) ? 'page' : undefined}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
              <button
                className='nav-link'
                type='button'
                data-testid='sign-out'
                style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
                onClick={() => { logout().catch(() => {}) }}
              >
                Sign out
              </button>
            </div>
          </nav>
        </div>
      </div>

      {children}

      <nav className='mobile-nav' aria-label='Primary mobile'>
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            className={isActive(path, item.href) ? 'active' : undefined}
            href={item.href}
            aria-current={isActive(path, item.href) ? 'page' : undefined}
          >
            {item.short}
          </a>
        ))}
      </nav>
    </>
  )
}
