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
    expect(result.lines[1]).toMatchObject({ activities: ['Reading memory', 'Comparing notes'], complete: true })
  })
})

describe('splitThinking', () => {
  it('extracts complete and streaming thinking blocks', () => {
    expect(splitThinking('<thinking>First sentence.</thinking>Answer.')).toEqual({ reasoning: 'First sentence.', answer: 'Answer.' })
    expect(splitThinking('<thinking>Still reasoning')).toEqual({ reasoning: 'Still reasoning', answer: '' })
  })
})
