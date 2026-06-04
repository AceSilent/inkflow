import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import katex from 'katex'

const remarkPlugins = [remarkMath]

function MathCode({ className = '', children }) {
  const isMath = /\blanguage-math\b/.test(className)

  if (!isMath) {
    return <code className={className}>{children}</code>
  }

  const displayMode = /\bmath-display\b/.test(className)
  const source = String(children ?? '').replace(/\n$/, '')
  const html = katex.renderToString(source, {
    displayMode,
    output: 'htmlAndMathml',
    strict: false,
    throwOnError: false,
    trust: false,
  })
  const Tag = displayMode ? 'div' : 'span'

  return (
    <Tag
      className={`markdown-math ${displayMode ? 'markdown-math-display' : 'markdown-math-inline'}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

const markdownComponents = {
  code: MathCode,
}

export function MarkdownContent({ children }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  )
}
