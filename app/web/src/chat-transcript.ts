export interface ChatEvent { seq: number, type: string, payload: unknown, createdAt?: string }
export interface ApprovalDetail { path?: string, command?: string, preview?: string, truncated?: boolean }
export interface PendingApproval { toolCallId: string, toolName: string, detail?: ApprovalDetail }
export interface ReasoningBlock { text: string, createdAt?: string }
export interface ActivityEntry { text: string, createdAt?: string }
export interface MessageAttachment { name: string, kind: 'image' | 'file' }
export interface Line {
  key: string
  role: 'user' | 'assistant' | 'system'
  text: string
  createdAt?: string
  reasoning?: string
  reasoningBlocks?: ReasoningBlock[]
  activities?: ActivityEntry[]
  complete?: boolean
  attachments?: MessageAttachment[]
}

function payloadAttachments (payload: unknown): MessageAttachment[] | undefined {
  if (payload === null || typeof payload !== 'object') return undefined
  const list = (payload as Record<string, unknown>).attachments
  if (!Array.isArray(list)) return undefined
  const attachments = list.filter((a): a is MessageAttachment =>
    a !== null && typeof a === 'object' && typeof (a as MessageAttachment).name === 'string')
  return attachments.length > 0 ? attachments : undefined
}

function payloadText (payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') return undefined
  const p = payload as Record<string, unknown>
  if (typeof p.text === 'string') return p.text
  const event = p.event as Record<string, unknown> | undefined
  return event !== undefined && typeof event.text === 'string' ? event.text : undefined
}

function agentContent (payload: unknown): { answer?: string, reasoningDelta?: string, reasoningSnapshot?: string, reasoningComplete?: string } {
  if (payload === null || typeof payload !== 'object') return {}
  const p = payload as Record<string, unknown>
  const isReasoning = p.contentType === 'reasoning'
  if (isReasoning) {
    if (p.type === 'content_end' && typeof p.reasoning === 'string') return { reasoningComplete: p.reasoning }
    if (typeof p.accumulated === 'string') return { reasoningSnapshot: p.accumulated }
    if (typeof p.reasoning === 'string') return { reasoningDelta: p.reasoning }
    if (typeof p.text === 'string') return { reasoningDelta: p.text }
    return {}
  }
  if (typeof p.accumulated === 'string') return { answer: p.accumulated }
  if ((p.type === 'content_end' || p.type === 'done') && typeof p.text === 'string') return { answer: p.text }
  // Older providers expose cumulative text directly without typed content.
  if (typeof p.text === 'string' && typeof p.type !== 'string') return { answer: p.text }
  return {}
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
  let activeReasoning = ''
  let activeReasoningAt: string | undefined
  let completedReasoning: ReasoningBlock[] = []
  let isProcessing = false
  let statusText: string | undefined

  const ensureAssistant = (seq: number): Line => {
    if (assistant === null) {
      assistant = { key: `a-${seq}`, role: 'assistant', text: '', activities: [], complete: false }
      lines.push(assistant)
    }
    return assistant
  }
  const updateAssistant = (seq: number, createdAt?: string): void => {
    const line = ensureAssistant(seq)
    line.createdAt ??= createdAt
    const parsed = splitThinking(snapshotText ?? chunkText)
    line.text = parsed.answer
    const blocks = [...completedReasoning]
    if (activeReasoning !== '') blocks.push({ text: activeReasoning, createdAt: activeReasoningAt })
    if (parsed.reasoning !== '') blocks.push({ text: parsed.reasoning, createdAt })
    line.reasoningBlocks = blocks
    line.reasoning = blocks.map(block => block.text).join('\n\n')
  }

  for (const e of events) {
    if (e.type === 'user_message') {
      assistant = null
      chunkText = ''
      snapshotText = undefined
      activeReasoning = ''
      activeReasoningAt = undefined
      completedReasoning = []
      isProcessing = true
      statusText = undefined
      const attachments = payloadAttachments(e.payload)
      lines.push({ key: `u-${e.seq}`, role: 'user', text: payloadText(e.payload) ?? '', createdAt: e.createdAt, ...(attachments !== undefined ? { attachments } : {}) })
    } else if (e.type === 'status') {
      const p = e.payload as Record<string, unknown> | null
      const status = typeof p?.text === 'string' ? p.text : (typeof p?.state === 'string' ? p.state : undefined)
      if (status !== undefined && status !== '') {
        statusText = status
        const line = ensureAssistant(e.seq)
        line.createdAt ??= e.createdAt
        const activities = line.activities ?? (line.activities = [])
        if (activities.at(-1)?.text !== status) activities.push({ text: status, createdAt: e.createdAt })
      }
    } else if (e.type === 'chunk' || e.type === 'agent_event') {
      isProcessing = true
      if (e.type === 'agent_event') {
        const content = agentContent(e.payload)
        if (content.answer !== undefined) snapshotText = content.answer
        if (content.reasoningSnapshot !== undefined) {
          activeReasoningAt ??= e.createdAt
          activeReasoning = content.reasoningSnapshot
        }
        if (content.reasoningDelta !== undefined) {
          activeReasoningAt ??= e.createdAt
          activeReasoning += content.reasoningDelta
        }
        if (content.reasoningComplete !== undefined) {
          const complete = content.reasoningComplete.trim()
          if (complete !== '' && completedReasoning.at(-1)?.text !== complete) completedReasoning.push({ text: complete, createdAt: activeReasoningAt ?? e.createdAt })
          activeReasoning = ''
          activeReasoningAt = undefined
        }
        if (content.answer === undefined && content.reasoningSnapshot === undefined && content.reasoningDelta === undefined && content.reasoningComplete === undefined) continue
      } else {
        const text = payloadText(e.payload)
        if (text === undefined || text === '') continue
        chunkText += text
      }
      updateAssistant(e.seq, e.createdAt)
    } else if (e.type === 'approval_request') {
      const p = e.payload as { toolCallId?: string, toolName?: string, detail?: ApprovalDetail }
      if (typeof p?.toolCallId === 'string') {
        approvals.set(p.toolCallId, {
          toolCallId: p.toolCallId,
          toolName: p.toolName ?? 'tool',
          ...(p.detail !== undefined && p.detail !== null ? { detail: p.detail } : {}),
        })
      }
      isProcessing = false
    } else if (e.type === 'approval_resolved' || e.type === 'approval_auto_denied') {
      const p = e.payload as { toolCallId?: string }
      if (typeof p?.toolCallId === 'string') approvals.delete(p.toolCallId)
      isProcessing = true
    } else if (e.type === 'compaction') {
      assistant = null
      lines.push({ key: `c-${e.seq}`, role: 'system', text: 'Context compacted', createdAt: e.createdAt })
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
