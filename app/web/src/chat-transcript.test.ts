import { describe, expect, it } from 'vitest'
import { foldTranscript, splitThinking } from './chat-transcript.js'

describe('foldTranscript', () => {
  it('appends incremental chunks instead of erasing preceding words', () => {
    const result = foldTranscript([
      { seq: 1, type: 'user_message', payload: { text: 'Question' } },
      { seq: 2, type: 'chunk', payload: { text: 'The' } },
      { seq: 3, type: 'chunk', payload: { text: ' answer' } },
      { seq: 4, type: 'chunk', payload: { text: ' is here.' } },
    ], true)
    expect(result.lines[1]?.text).toBe('The answer is here.')
  })

  it('replaces cumulative snapshots without duplicating them', () => {
    const result = foldTranscript([
      { seq: 1, type: 'user_message', payload: { text: 'Question' } },
      { seq: 2, type: 'agent_event', payload: { text: 'The' } },
      { seq: 3, type: 'agent_event', payload: { text: 'The answer' } },
      { seq: 4, type: 'agent_event', payload: { text: 'The answer is here.' } },
    ], true)
    expect(result.lines[1]?.text).toBe('The answer is here.')
  })

  it('uses LM Studio accumulated content instead of its one-token text delta', () => {
    const result = foldTranscript([
      { seq: 1, type: 'user_message', payload: { text: 'Question' } },
      { seq: 2, type: 'agent_event', payload: { type: 'content_start', contentType: 'text', text: 'The', accumulated: 'The' } },
      { seq: 3, type: 'agent_event', payload: { type: 'content_start', contentType: 'text', text: ' answer', accumulated: 'The answer' } },
      { seq: 4, type: 'agent_event', payload: { type: 'content_start', contentType: 'text', text: ' builds.', accumulated: 'The answer builds.' } },
    ], true)
    expect(result.lines[1]?.text).toBe('The answer builds.')
  })

  it('preserves typed LM Studio reasoning content', () => {
    const result = foldTranscript([
      { seq: 1, type: 'user_message', payload: { text: 'Question' } },
      { seq: 2, type: 'agent_event', payload: { type: 'content_start', contentType: 'reasoning', text: 'Checking', accumulated: 'Checking' } },
      { seq: 3, type: 'agent_event', payload: { type: 'content_start', contentType: 'reasoning', text: ' notes', accumulated: 'Checking notes' } },
      { seq: 4, type: 'agent_event', payload: { type: 'content_end', contentType: 'reasoning', reasoning: 'Checking notes carefully.' } },
      { seq: 5, type: 'agent_event', payload: { type: 'done', text: 'Answer.' } },
    ], true)
    expect(result.lines[1]).toMatchObject({ text: 'Answer.', reasoning: 'Checking notes carefully.' })
  })

  it('builds delta-only reasoning and preserves every completed iteration', () => {
    const result = foldTranscript([
      { seq: 1, type: 'user_message', payload: { text: 'Question' } },
      { seq: 2, type: 'agent_event', createdAt: '2026-07-12T01:00:00.000Z', payload: { type: 'content_start', contentType: 'reasoning', reasoning: 'First' } },
      { seq: 3, type: 'agent_event', payload: { type: 'content_start', contentType: 'reasoning', reasoning: ' thought.' } },
      { seq: 4, type: 'agent_event', payload: { type: 'content_end', contentType: 'reasoning', reasoning: 'First thought.' } },
      { seq: 5, type: 'agent_event', createdAt: '2026-07-12T01:01:00.000Z', payload: { type: 'content_start', contentType: 'reasoning', reasoning: 'Second' } },
      { seq: 6, type: 'agent_event', payload: { type: 'content_start', contentType: 'reasoning', reasoning: ' thought.' } },
      { seq: 7, type: 'agent_event', payload: { type: 'content_end', contentType: 'reasoning', reasoning: 'Second thought.' } },
      { seq: 8, type: 'agent_event', payload: { type: 'done', text: 'Answer.' } },
    ], true)
    expect(result.lines[1]).toMatchObject({ text: 'Answer.', reasoning: 'First thought.\n\nSecond thought.' })
    expect(result.lines[1]?.reasoningBlocks).toEqual([
      { text: 'First thought.', createdAt: '2026-07-12T01:00:00.000Z' },
      { text: 'Second thought.', createdAt: '2026-07-12T01:01:00.000Z' },
    ])
  })

  it('carries message timestamps from their first events', () => {
    const result = foldTranscript([
      { seq: 1, type: 'user_message', createdAt: '2026-07-12T01:00:00.000Z', payload: { text: 'Question' } },
      { seq: 2, type: 'agent_event', createdAt: '2026-07-12T01:00:01.000Z', payload: { type: 'done', text: 'Answer' } },
    ], true)
    expect(result.lines.map(line => line.createdAt)).toEqual(['2026-07-12T01:00:00.000Z', '2026-07-12T01:00:01.000Z'])
  })

  it('uses snapshots as canonical when both stream forms are emitted', () => {
    const result = foldTranscript([
      { seq: 1, type: 'user_message', payload: { text: 'Question' } },
      { seq: 2, type: 'chunk', payload: { text: 'The ' } },
      { seq: 3, type: 'agent_event', payload: { text: 'The answer' } },
      { seq: 4, type: 'chunk', payload: { text: 'answer' } },
      { seq: 5, type: 'agent_event', payload: { text: 'The answer is here.' } },
    ], true)
    expect(result.lines[1]?.text).toBe('The answer is here.')
  })

  it('preserves deduplicated activity after completion', () => {
    const result = foldTranscript([
      { seq: 1, type: 'user_message', payload: { text: 'Question' } },
      { seq: 2, type: 'status', payload: { text: 'Reading memory' } },
      { seq: 3, type: 'status', payload: { text: 'Reading memory' } },
      { seq: 4, type: 'status', payload: { text: 'Comparing notes' } },
      { seq: 5, type: 'agent_event', payload: { text: 'Done.' } },
      { seq: 6, type: 'ended', payload: null },
    ], false)
    expect(result.lines[1]).toMatchObject({ activities: [{ text: 'Reading memory' }, { text: 'Comparing notes' }], complete: true })
  })
})

describe('splitThinking', () => {
  it('extracts complete and streaming thinking blocks', () => {
    expect(splitThinking('<thinking>First sentence.</thinking>Answer.')).toEqual({ reasoning: 'First sentence.', answer: 'Answer.' })
    expect(splitThinking('<thinking>Still reasoning')).toEqual({ reasoning: 'Still reasoning', answer: '' })
  })
})
