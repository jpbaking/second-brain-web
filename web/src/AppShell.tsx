import type { ReactNode } from 'react'

/**
 * Authenticated app shell: a sticky top navigation across the core screens,
 * wrapping the routed page content. Login and the setup page are not wrapped.
 */

interface NavItem { href: string, label: string }

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Command centre' },
  { href: '/chat', label: 'Chat' },
  { href: '/follow-ups', label: 'Follow-ups' },
  { href: '/reports', label: 'Reports' },
  { href: '/vault', label: 'Vault' },
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
            <ul className='nav-links'>
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
              <li>
                <button
                  className='nav-link'
                  type='button'
                  data-testid='sign-out'
                  style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
                  onClick={() => { logout().catch(() => {}) }}
                >
                  Sign out
                </button>
              </li>
            </ul>
          </nav>
        </div>
      </div>
      {children}
    </>
  )
}
