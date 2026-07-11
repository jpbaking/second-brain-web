export interface ChatEvent { seq: number, type: string, payload: unknown }
export interface PendingApproval { toolCallId: string, toolName: string }
export interface Line {
  key: string
  role: 'user' | 'assistant' | 'system'
  text: string
  reasoning?: string
  activities?: string[]
  complete?: boolean
}

function payloadText (payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') return undefined
  const p = payload as Record<string, unknown>
  if (typeof p.text === 'string') return p.text
  const event = p.event as Record<string, unknown> | undefined
  return event !== undefined && typeof event.text === 'string' ? event.text : undefined
}

export function splitThinking (text: string): { answer: string, reasoning: string } {
  const reasoning: string[] = []
  const answer = text.replace(/<thinking>([\s\S]*?)(?:<\/thinking>|$)/g, (_match, body: string) => {
    if (body.trim() !== '') reasoning.push(body.trim())
    return ''
  })
  return { answer: answer.trim(), reasoning: reasoning.join('\n\n') }
}

/** Fold persisted events. Chunks are deltas; agent events are cumulative snapshots. */
export function foldTranscript (events: ChatEvent[], isLive: boolean): { lines: Line[], approvals: PendingApproval[], isProcessing: boolean, statusText?: string } {
  const lines: Line[] = []
  const approvals = new Map<string, PendingApproval>()
  let assistant: Line | null = null
  let chunkText = ''
  let snapshotText: string | undefined
  let isProcessing = false
  let statusText: string | undefined

  const ensureAssistant = (seq: number): Line => {
    if (assistant === null) {
      assistant = { key: `a-${seq}`, role: 'assistant', text: '', activities: [], complete: false }
      lines.push(assistant)
    }
    return assistant
  }
  const updateAssistant = (seq: number): void => {
    const line = ensureAssistant(seq)
    const parsed = splitThinking(snapshotText ?? chunkText)
    line.text = parsed.answer
    line.reasoning = parsed.reasoning
  }

  for (const e of events) {
    if (e.type === 'user_message') {
      assistant = null
      chunkText = ''
      snapshotText = undefined
      isProcessing = true
      statusText = undefined
      lines.push({ key: `u-${e.seq}`, role: 'user', text: payloadText(e.payload) ?? '' })
    } else if (e.type === 'status') {
      const p = e.payload as Record<string, unknown> | null
      const status = typeof p?.text === 'string' ? p.text : (typeof p?.state === 'string' ? p.state : undefined)
      if (status !== undefined && status !== '') {
        statusText = status
        const line = ensureAssistant(e.seq)
        const activities = line.activities ?? (line.activities = [])
        if (activities.at(-1) !== status) activities.push(status)
      }
    } else if (e.type === 'chunk' || e.type === 'agent_event') {
      isProcessing = true
      const text = payloadText(e.payload)
      if (text === undefined || text === '') continue
      if (e.type === 'chunk') chunkText += text
      else snapshotText = text
      updateAssistant(e.seq)
    } else if (e.type === 'approval_request') {
      const p = e.payload as { toolCallId?: string, toolName?: string }
      if (typeof p?.toolCallId === 'string') approvals.set(p.toolCallId, { toolCallId: p.toolCallId, toolName: p.toolName ?? 'tool' })
      isProcessing = false
    } else if (e.type === 'approval_resolved' || e.type === 'approval_auto_denied') {
      const p = e.payload as { toolCallId?: string }
      if (typeof p?.toolCallId === 'string') approvals.delete(p.toolCallId)
      isProcessing = true
    } else if (e.type === 'compaction') {
      assistant = null
      lines.push({ key: `c-${e.seq}`, role: 'system', text: 'Context compacted' })
    } else if (e.type === 'ended') {
      const current = lines.at(-1)
      if (current?.role === 'assistant') current.complete = true
      assistant = null
      isProcessing = false
      statusText = undefined
    }
  }
  if (!isLive) isProcessing = false
  return { lines, approvals: [...approvals.values()], isProcessing, statusText }
}
