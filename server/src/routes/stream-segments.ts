import { REASONING_CLOSE, REASONING_OPEN } from '../llm/provider.js'

export type AssistantSegment =
  | { type: 'content'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; name: string; argsPreview?: string; result?: string; status: 'running' | 'done' }
  | { type: 'options'; description: string; options: string[] }

export type StreamSegmentEvent =
  | { type: 'content'; token: string }
  | { type: 'thinking_start' }
  | { type: 'thinking'; token: string }
  | { type: 'thinking_done' }
  | { type: 'tool_start'; name: string; args_preview: string }
  | { type: 'tool_done'; name: string; result_preview: string }
  | { type: 'options'; description: string; options: string[] }

type SegmentMode = 'content' | 'thinking'
const TOOL_RESULT_PREVIEW_CHARS = 1200

export class ReasoningSegmentAccumulator {
  readonly segments: AssistantSegment[] = []
  fullText = ''
  fullThinking = ''
  private pending = ''
  private segmentMode: SegmentMode = 'content'
  private openContent: { type: 'content'; text: string } | null = null
  private openThinking: { type: 'thinking'; text: string } | null = null

  constructor(private readonly emit: (event: StreamSegmentEvent) => void) {}

  pushText(text: string, final = false): void {
    this.pending += text
    this.drain(final)
  }

  flushForBoundary(): void {
    this.drain(true)
    this.flushOpenThinking()
    this.flushOpenContent()
  }

  finalize(): void {
    this.drain(true)
    this.flushOpenThinking()
    this.flushOpenContent()
  }

  hasAnything(): boolean {
    return this.fullText.length > 0 || this.fullThinking.length > 0 || this.segments.length > 0
  }

  addOptions(input: { description?: string; options?: string }): void {
    const options = (input.options ?? '').split('\n').map(s => s.trim()).filter(Boolean)
    const segment: AssistantSegment = { type: 'options', description: input.description ?? '', options }
    this.segments.push(segment)
    this.emit({ type: 'options', description: segment.description, options: segment.options })
  }

  addToolCall(name: string, input: unknown): void {
    const argsPreview = (JSON.stringify(input) ?? '').slice(0, 200)
    this.segments.push({ type: 'tool_call', name, argsPreview, status: 'running' })
    this.emit({ type: 'tool_start', name, args_preview: argsPreview })
  }

  addToolResult(name: string, output: unknown): void {
    const preview = String(output).slice(0, TOOL_RESULT_PREVIEW_CHARS)
    this.finishTool(name, preview)
  }

  addToolError(name: string, error: unknown): void {
    this.finishTool(name, `[error] ${String(error).slice(0, 200)}`)
  }

  private finishTool(name: string, resultPreview: string): void {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const segment = this.segments[i]
      if (segment.type === 'tool_call' && segment.name === name && segment.status === 'running') {
        segment.status = 'done'
        segment.result = resultPreview
        break
      }
    }
    this.emit({ type: 'tool_done', name, result_preview: resultPreview })
  }

  private appendContent(text: string): void {
    if (!this.openContent) this.openContent = { type: 'content', text: '' }
    this.openContent.text += text
    this.fullText += text
    this.emit({ type: 'content', token: text })
  }

  private appendThinking(text: string): void {
    if (!this.openThinking) {
      this.openThinking = { type: 'thinking', text: '' }
      this.emit({ type: 'thinking_start' })
    }
    this.openThinking.text += text
    this.fullThinking += text
    this.emit({ type: 'thinking', token: text })
  }

  private flushOpenContent(): void {
    if (this.openContent && this.openContent.text.trim()) this.segments.push(this.openContent)
    this.openContent = null
  }

  private flushOpenThinking(): void {
    if (this.openThinking && this.openThinking.text.trim()) {
      this.segments.push(this.openThinking)
      this.emit({ type: 'thinking_done' })
    }
    this.openThinking = null
  }

  private drain(final: boolean): void {
    while (this.pending.length > 0) {
      const marker = this.segmentMode === 'content' ? REASONING_OPEN : REASONING_CLOSE
      const idx = this.pending.indexOf(marker)
      if (idx === -1) {
        const keep = final ? 0 : marker.length - 1
        const flushLen = this.pending.length - keep
        if (flushLen <= 0) return
        const chunk = this.pending.slice(0, flushLen)
        this.pending = this.pending.slice(flushLen)
        if (this.segmentMode === 'content') this.appendContent(chunk)
        else this.appendThinking(chunk)
        return
      }

      if (idx > 0) {
        const chunk = this.pending.slice(0, idx)
        if (this.segmentMode === 'content') this.appendContent(chunk)
        else this.appendThinking(chunk)
      }

      this.pending = this.pending.slice(idx + marker.length)
      if (this.segmentMode === 'thinking') this.flushOpenThinking()
      else this.flushOpenContent()
      this.segmentMode = this.segmentMode === 'content' ? 'thinking' : 'content'
    }
  }
}
