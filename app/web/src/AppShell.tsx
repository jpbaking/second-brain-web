import './app-shell.css'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Authenticated app shell (milestone 16): a chat-first layout in the style of
 * the Claude/ChatGPT/Gemini web apps. A left sidebar carries the New chat
 * action, the recent-chat list, and the other screens as secondary nav; the
 * routed screen fills the main pane. The sidebar is persistent on wide
 * viewports and an off-canvas drawer (behind a top hamburger bar) below.
 */

interface ChatSessionSummary { id: string, title: string, status: string }

interface NavItem { href: string, label: string }

const NAV_ITEMS: NavItem[] = [
  { href: '/command-centre', label: 'Command centre' },
  { href: '/capture', label: 'Capture' },
  { href: '/prep', label: 'Meeting prep' },
  { href: '/follow-ups', label: 'Follow-ups' },
  { href: '/reports', label: 'Reports' },
  { href: '/search', label: 'Search' },
  { href: '/explorer', label: 'Explorer' },
  { href: '/profile', label: 'Profile' },
  { href: '/schedules', label: 'Schedules' },
  { href: '/vault', label: 'Vault' },
  { href: '/backup', label: 'Backup' },
  { href: '/providers', label: 'Providers' },
]

const RECENTS_SHOWN = 20

function isActive (path: string, href: string): boolean {
  return path.startsWith(href)
}

function isChatPath (path: string): boolean {
  return path === '/' || path === '/chat' || path.startsWith('/chat/')
}

function activeChatId (path: string): string | null {
  const match = /^\/chat\/([^/]+)$/.exec(path)
  return match !== null && match[1] !== undefined && match[1] !== 'new' ? match[1] : null
}

async function logout (): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
  window.location.assign('/login')
}

export function AppShell ({ path: initialPath, children }: { path: string, children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  // ChatScreen rewrites the URL (history.replaceState) when auto-opening the
  // last active chat or creating one — track the live pathname so the sidebar
  // highlight follows.
  const [path, setPath] = useState(initialPath)
  const [onboarding, setOnboarding] = useState<{ providers: number, vaultConfigured: boolean } | null>(null)

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/sessions', { credentials: 'same-origin' })
      if (res.ok) setSessions((await res.json() as { sessions: ChatSessionSummary[] }).sessions)
    } catch { /* the sidebar list is non-critical */ }
  }, [])

  useEffect(() => {
    loadSessions().catch(() => {})
    // ChatScreen announces new/retitled/opened chats without a reload.
    const onChanged = () => {
      setPath(window.location.pathname)
      loadSessions().catch(() => {})
    }
    window.addEventListener('chats-changed', onChanged)
    return () => window.removeEventListener('chats-changed', onChanged)
  }, [loadSessions])

  useEffect(() => {
    Promise.all([
      fetch('/api/providers', { credentials: 'same-origin' }).then(async r => {
        if (r.status === 401) { window.location.assign('/login'); return { profiles: [] } }
        return r.ok ? await r.json() as { profiles: unknown[] } : { profiles: [] }
      }),
      fetch('/api/vault/status', { credentials: 'same-origin' }).then(async r => {
        if (r.status === 401) { window.location.assign('/login'); return { configured: false } }
        return r.ok ? await r.json() as { configured: boolean } : { configured: false }
      })
    ]).then(([prov, vault]) => {
      const providersCount = prov.profiles.length
      const vaultConfigured = vault.configured
      if (providersCount > 0 && !vaultConfigured && window.location.pathname !== '/vault') {
        window.location.replace('/vault')
      } else {
        setOnboarding({ providers: providersCount, vaultConfigured })
      }
    }).catch(() => {
      setOnboarding({ providers: 1, vaultConfigured: true })
    })
  }, [])

  const chatId = activeChatId(path)

  if (onboarding === null) return null

  let navItems = NAV_ITEMS
  let content = children
  let showNewChat = true
  let showRecents = true

  if (onboarding.providers === 0) {
    navItems = []
    showNewChat = false
    showRecents = false
    content = (
      <div className='app-page'>
        <header className='app-hero'>
          <a className='app-brand' href='/' aria-label='Second Brain home'>
            <img src='/design/assets/logo-mark-invert.svg' alt='' />
            <span className='app-wordmark'>Second Brain</span>
          </a>
          <p className='app-kicker'>Setup required</p>
          <h1 className='app-title'>No providers configured</h1>
          <p className='app-tagline'>You must configure at least one LLM provider to use Second Brain.</p>
        </header>
        <main className='action-card'>
          <div className='alert alert-danger' role='alert'>
            <span className='alert-title'>Action required</span>
            <span>Please edit <code>providers.yaml</code> on your host machine and restart the container to apply changes.</span>
          </div>
        </main>
      </div>
    )
  } else if (!onboarding.vaultConfigured) {
    navItems = NAV_ITEMS.filter(item => item.href === '/vault')
    showNewChat = false
    showRecents = false
  }

  return (
    <div className='shell'>
      {open && <div className='shell-scrim' onClick={() => setOpen(false)} aria-hidden='true' />}

      <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label='Sidebar'>
        <div className='sidebar-head'>
          <a className='sidebar-brand' href='/'>
            <img src='/design/assets/logo-mark.svg' alt='' />
            <span>Second Brain</span>
          </a>
          <button className='sidebar-dismiss' type='button' aria-label='Close menu' onClick={() => setOpen(false)}>×</button>
        </div>

        {showNewChat && <a className='btn btn-primary sidebar-new-chat' href='/chat/new' data-testid='new-chat'>+ New chat</a>}

        {showRecents && (
          <nav className='sidebar-recents' aria-label='Recent chats'>
            <h2 className='sidebar-heading'>Chats</h2>
            {sessions.length === 0
              ? <p className='sidebar-empty'>No chats yet.</p>
              : (
                <ul data-testid='chat-list'>
                  {sessions.slice(0, RECENTS_SHOWN).map(s => (
                    <li key={s.id}>
                      <a
                        className={`sidebar-chat${s.id === chatId ? ' is-active' : ''}`}
                        href={`/chat/${s.id}`}
                        aria-current={s.id === chatId ? 'page' : undefined}
                        title={s.title}
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
                )}
          </nav>
        )}

        <nav className='sidebar-nav' aria-label='Screens'>
          {navItems.map(item => (
            <a
              key={item.href}
              className={`sidebar-link${isActive(path, item.href) ? ' is-active' : ''}`}
              href={item.href}
              aria-current={isActive(path, item.href) ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
          <button className='sidebar-link sidebar-signout' type='button' data-testid='sign-out' onClick={() => { logout().catch(() => {}) }}>
            Sign out
          </button>
        </nav>
      </aside>

      <div className='shell-main'>
        <header className='shell-topbar'>
          <button className='shell-menu' type='button' aria-label='Open menu' data-testid='menu-toggle' onClick={() => setOpen(true)}>☰</button>
          <a className='shell-topbar-brand' href='/'>Second Brain</a>
        </header>
        <div className='shell-content' data-chat={isChatPath(path) ? 'true' : undefined}>
          {content}
        </div>
      </div>
    </div>
  )
}
