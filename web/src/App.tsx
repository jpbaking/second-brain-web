import { useEffect, useState } from 'react'

export function App () {
  const [health, setHealth] = useState<string>('checking…')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json() as Promise<{ status: string }>)
      .then((body) => setHealth(body.status))
      .catch(() => setHealth('unreachable'))
  }, [])

  return (
    <main>
      <h1>Second Brain</h1>
      <p>
        Server health: <span data-testid='health'>{health}</span>
      </p>
    </main>
  )
}
