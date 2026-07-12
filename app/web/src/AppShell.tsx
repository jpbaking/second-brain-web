import './app-shell.css'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AppHero } from './AppHero.js'

/**
 * Authenticated app shell (milestone 16): a chat-first layout in the style of
 * the Claude/ChatGPT/Gemini web apps. A left sidebar carries the New chat
 * action, the recent-chat list, and the other screens as secondary nav; the
 * routed screen fills the main pane. The sidebar is persistent on wide
 * viewports and an off-canvas drawer (behind a top hamburger bar) below.
 */

interface ChatSessionSummary { id: string, title: string, status: string, pinned: boolean }

type IconName = 'new' | 'capture' | 'search' | 'command' | 'prep' | 'follow' | 'reports' | 'explorer' | 'profile' | 'schedules' | 'vault' | 'backup' | 'providers' | 'signout' | 'more' | 'collapse' | 'expand' | 'trash'
interface NavItem { href: string, label: string, icon: IconName }

const NAV_ITEMS: NavItem[] = [
  { href: '/command-centre', label: 'Command centre', icon: 'command' },
  { href: '/prep', label: 'Meeting prep', icon: 'prep' },
  { href: '/follow-ups', label: 'Follow-ups', icon: 'follow' },
  { href: '/reports', label: 'Reports', icon: 'reports' },
  { href: '/search', label: 'Vault search', icon: 'search' },
  { href: '/explorer', label: 'Explorer', icon: 'explorer' },
  { href: '/schedules', label: 'Schedules', icon: 'schedules' },
  { href: '/vault', label: 'Vault', icon: 'vault' },
  { href: '/backup', label: 'Backup', icon: 'backup' },
  { href: '/profile', label: 'Profile', icon: 'profile' },
  { href: '/providers', label: 'Providers', icon: 'providers' },
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

function SidebarIcon ({ name }: { name: IconName }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const paths: Record<IconName, ReactNode> = {
    new: <><path d='M12 5v14M5 12h14' /><path d='M4 4h16v16H4z' /></>,
    capture: <><path d='m21 12-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 1 1 5.7 5.7L9 18.4a2 2 0 0 1-2.8-2.8l8.5-8.5' /></>,
    search: <><circle cx='11' cy='11' r='7' /><path d='m20 20-4-4' /></>,
    command: <><path d='M4 5h16M4 12h10M4 19h16' /><circle cx='17' cy='12' r='2' /></>,
    prep: <><path d='M7 3v4M17 3v4M4 9h16v11H4z' /><path d='m8 14 2 2 5-5' /></>,
    follow: <><path d='M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9' /><path d='M10 21h4' /></>,
    reports: <><path d='M6 2h9l4 4v16H6z' /><path d='M14 2v5h5M9 13h6M9 17h6' /></>,
    explorer: <><circle cx='12' cy='12' r='9' /><path d='m15 9-2 5-5 2 2-5z' /></>,
    profile: <><circle cx='12' cy='8' r='4' /><path d='M4 21a8 8 0 0 1 16 0' /></>,
    schedules: <><circle cx='12' cy='12' r='9' /><path d='M12 7v5l3 2' /></>,
    vault: <><rect x='3' y='5' width='18' height='15' rx='2' /><path d='M3 10h18M8 5V3h8v2' /></>,
    backup: <><path d='M20 7v5h-5M4 17v-5h5' /><path d='M6 8a7 7 0 0 1 12-2l2 6M18 16a7 7 0 0 1-12 2l-2-6' /></>,
    providers: <><path d='M8 12h8M12 8v8' /><circle cx='12' cy='12' r='9' /></>,
    signout: <><path d='M10 17l5-5-5-5M15 12H3' /><path d='M14 3h7v18h-7' /></>,
    more: <><circle cx='5' cy='12' r='1' fill='currentColor' /><circle cx='12' cy='12' r='1' fill='currentColor' /><circle cx='19' cy='12' r='1' fill='currentColor' /></>,
    trash: <><path d='M4 7h16M10 11v6M14 11v6' /><path d='M6 7l1 14h10l1-14M9 7V4h6v3' /></>,
    collapse: <><path d='m14 7-5 5 5 5' /><rect x='3' y='3' width='18' height='18' rx='3' /></>,
    expand: <><path d='m10 7 5 5-5 5' /><rect x='3' y='3' width='18' height='18' rx='3' /></>,
  }
  return <svg {...common}>{paths[name]}</svg>
}

export function AppShell ({ path: initialPath, children }: { path: string, children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem('sbw-sidebar-collapsed') === 'true')
  const [searchOpen, setSearchOpen] = useState(false)
  const [chatQuery, setChatQuery] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  // null = no active search; otherwise the server-side match set (m62-03:
  // the query runs over titles and message bodies, so it cannot be a local
  // title filter).
  const [searchResults, setSearchResults] = useState<ChatSessionSummary[] | null>(null)
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

  useEffect(() => {
    if (chatQuery.trim() === '') { setSearchResults(null); return }
    const timer = window.setTimeout(() => {
      fetch(`/api/chat/sessions?q=${encodeURIComponent(chatQuery.trim())}`, { credentials: 'same-origin' })
        .then(async res => { if (res.ok) setSearchResults((await res.json() as { sessions: ChatSessionSummary[] }).sessions) })
        .catch(() => {})
    }, 200)
    return () => window.clearTimeout(timer)
  }, [chatQuery])

  const chatId = activeChatId(path)
  const visibleSessions = (searchResults ?? sessions).slice(0, RECENTS_SHOWN)

  const setDesktopCollapsed = (value: boolean) => {
    setCollapsed(value)
    window.localStorage.setItem('sbw-sidebar-collapsed', String(value))
  }

  const togglePin = async (session: ChatSessionSummary) => {
    const res = await fetch(`/api/chat/sessions/${session.id}`, {
      method: 'PATCH', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pinned: !session.pinned })
    })
    if (res.ok) await loadSessions()
  }

  const deleteChat = async (session: ChatSessionSummary) => {
    const res = await fetch(`/api/chat/sessions/${session.id}`, { method: 'DELETE', credentials: 'same-origin' })
    if (!res.ok) return
    setSearchResults(results => results === null ? null : results.filter(other => other.id !== session.id))
    if (session.id === activeChatId(path)) { window.location.assign('/chat/new'); return }
    await loadSessions()
  }

  const [clearPromptOpen, setClearPromptOpen] = useState(false)

  const clearChats = async (preservePinned: boolean) => {
    setClearPromptOpen(false)
    const res = await fetch(`/api/chat/sessions?preservePinned=${preservePinned}`, { method: 'DELETE', credentials: 'same-origin' })
    if (res.ok) window.location.assign('/chat/new')
  }

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
        <AppHero title='No providers configured' tagline='You must configure at least one LLM provider to use Second Brain.' kicker='Setup required' />
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
    <div className={`shell${collapsed ? ' is-sidebar-collapsed' : ''}`}>
      {open && <div className='shell-scrim' onClick={() => setOpen(false)} aria-hidden='true' />}

      <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label='Sidebar'>
        <div className='sidebar-head'>
          <button className='sidebar-brand sidebar-brand-open' type='button' aria-label='Open sidebar' title='Open sidebar' onClick={() => setDesktopCollapsed(false)}>
            <img src='/design/assets/logo-mark.svg' alt='' />
            <span className='sidebar-brand-expand'><SidebarIcon name='expand' /></span>
            <span>Second Brain</span>
          </button>
          <button className='sidebar-collapse' type='button' aria-label='Close sidebar' title='Close sidebar' onClick={() => setDesktopCollapsed(true)}><SidebarIcon name='collapse' /></button>
          <button className='sidebar-dismiss' type='button' aria-label='Close menu' onClick={() => setOpen(false)}>×</button>
        </div>

        {showNewChat && (
          <nav className='sidebar-primary' aria-label='Primary actions'>
            <a className={`sidebar-action${isChatPath(path) ? ' is-active' : ''}`} href='/chat/new' data-testid='new-chat' aria-current={isChatPath(path) ? 'page' : undefined}><SidebarIcon name='new' /><span>New chat</span></a>
            <a className={`sidebar-action${isActive(path, '/capture') ? ' is-active' : ''}`} href='/capture' aria-current={isActive(path, '/capture') ? 'page' : undefined}><SidebarIcon name='capture' /><span>Capture</span></a>
            <button className={`sidebar-action${searchOpen ? ' is-active' : ''}`} type='button' aria-expanded={searchOpen} onClick={() => { if (collapsed) setDesktopCollapsed(false); setSearchOpen(value => !value); setChatQuery('') }}><SidebarIcon name='search' /><span>Search chats</span></button>
          </nav>
        )}

        {showRecents && searchOpen && (
          <div className='sidebar-chat-search'>
            <SidebarIcon name='search' />
            <input type='search' autoFocus value={chatQuery} onChange={event => setChatQuery(event.target.value)} placeholder='Search chats' aria-label='Search chats' />
          </div>
        )}

        {showRecents && (
          <nav className='sidebar-recents' aria-label='Recent chats'>
            <div className='sidebar-heading-row'>
              <h2 className='sidebar-heading'>Chats</h2>
              {sessions.length > 0 && (
                <button type='button' className='sidebar-chat-clear-trigger' onClick={() => setClearPromptOpen(true)}>Clear</button>
              )}
            </div>
            {sessions.length === 0
              ? <p className='sidebar-empty'>No chats yet.</p>
              : visibleSessions.length === 0
                ? <p className='sidebar-empty'>No matching chats.</p>
                : (
                  <ul data-testid='chat-list'>
                    {visibleSessions.map(s => (
                      <li key={s.id}>
                        <a
                          className={`sidebar-chat${s.id === chatId ? ' is-active' : ''}`}
                          href={`/chat/${s.id}`}
                          aria-current={s.id === chatId ? 'page' : undefined}
                          title={s.title}
                        >
                          {s.pinned ? '★ ' : ''}{s.title}
                        </a>
                        <button className='sidebar-chat-delete' type='button' aria-label={`Delete ${s.title}`} title='Delete chat' onClick={() => { deleteChat(s).catch(() => {}) }}><SidebarIcon name='trash' /></button>
                        <button className='sidebar-chat-pin' type='button' aria-label={s.pinned ? `Unpin ${s.title}` : `Pin ${s.title}`} onClick={() => { togglePin(s).catch(() => {}) }}>{s.pinned ? '★' : '☆'}</button>
                      </li>
                    ))}
                  </ul>
                  )}
          </nav>
        )}

        <div className='sidebar-bottom'>
          {moreOpen && (
            <nav className='sidebar-more-menu' aria-label='Other pages'>
              {navItems.map(item => (
                <a key={item.href} className={`sidebar-more-item${isActive(path, item.href) ? ' is-active' : ''}`} href={item.href} aria-current={isActive(path, item.href) ? 'page' : undefined}>
                  <SidebarIcon name={item.icon} /><span>{item.label}</span>
                </a>
              ))}
            </nav>
          )}
          <button className='sidebar-bottom-action sidebar-signout' type='button' data-testid='sign-out' onClick={() => { logout().catch(() => {}) }}><SidebarIcon name='signout' /><span>Sign out</span></button>
          <button className={`sidebar-bottom-action sidebar-more-trigger${moreOpen ? ' is-active' : ''}`} type='button' aria-label='More pages' title='More pages' aria-expanded={moreOpen} onClick={() => { if (collapsed) { setDesktopCollapsed(false); setMoreOpen(true) } else setMoreOpen(value => !value) }}><SidebarIcon name='more' /></button>
        </div>
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

      {clearPromptOpen && (
        <div className='review-backdrop' role='dialog' aria-modal='true' aria-labelledby='clear-chats-title' onClick={() => setClearPromptOpen(false)}>
          <div className='action-card review-dialog' onClick={e => e.stopPropagation()}>
            <h2 id='clear-chats-title' className='card-title'>Clear chats</h2>
            <p className='clear-chats-prompt'>Choose what to delete.</p>
            <div className='form-actions clear-chats-actions'>
              <button type='button' className='btn btn-secondary' onClick={() => { clearChats(false).catch(() => {}) }}>Clear all</button>
              <button type='button' className='btn btn-secondary' onClick={() => { clearChats(true).catch(() => {}) }}>Clear non-favourites</button>
              <button type='button' className='btn btn-danger' onClick={() => setClearPromptOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
