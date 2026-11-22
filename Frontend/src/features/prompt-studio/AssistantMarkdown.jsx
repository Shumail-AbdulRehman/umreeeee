import { useState } from 'react'
import { Copy } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { copyText } from './clipboard'
import './markdown.css'

// Keep the parser's literal value before the HTML adapter appends a newline.
// This visits parsed nodes; Markdown syntax is handled entirely by the library.
function remarkLiteralCode() {
  return function transform(tree) {
    function visit(node) {
      if (node.type === 'code') {
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            'data-studio-code': node.value,
            'data-studio-language': node.lang || '',
          },
        }
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}

function CopyAction({ text, kind }) {
  const [status, setStatus] = useState('idle')
  const label = `Copy ${kind}`
  const feedback = status === 'success'
    ? `${kind === 'code' ? 'Code' : 'Response'} copied.`
    : status === 'error'
      ? `Could not copy ${kind}. Select it and copy manually.`
      : ''

  async function handleCopy() {
    setStatus('pending')
    try {
      await copyText(text)
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="studio-copy-action">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="studio-markdown-copy"
        onClick={handleCopy}
        disabled={status === 'pending'}
        aria-label={label}
      >
        <Copy aria-hidden="true" />
        {label}
      </Button>
      <span className="studio-copy-status" data-state={status} role="status" aria-live="polite" aria-atomic="true">
        {feedback}
      </span>
    </div>
  )
}

function CodeBlock({ node }) {
  const code = node.children.find((child) => child.tagName === 'code')
  const literal = code.properties['data-studio-code']
  const language = code.properties['data-studio-language']

  return (
    <div className="studio-code-block">
      <div className="studio-code-heading">
        <span className="studio-code-language">{language || 'Code'}</span>
        <CopyAction text={literal} kind="code" />
      </div>
      <pre tabIndex={0} role="region" aria-label={language ? `${language} code` : 'Code block'}>
        <code>{literal}</code>
      </pre>
    </div>
  )
}

function MarkdownTable({ children }) {
  return (
    <div className="studio-markdown-table" tabIndex={0} role="region" aria-label="Response table">
      <table>{children}</table>
    </div>
  )
}

function MarkdownLink({ href, title, children }) {
  // An unsafe URL is already emptied by react-markdown's default sanitizer.
  if (!href) return <span>{children}</span>
  return <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>
}

function MarkdownImage({ src, alt }) {
  const description = alt || 'Image'
  if (!src) return <span>{description} (image unavailable)</span>
  return (
    <a className="studio-markdown-image-link" href={src} target="_blank" rel="noopener noreferrer">
      Image: {description}
    </a>
  )
}

function TaskCheckbox({ checked }) {
  return <input type="checkbox" checked={checked} disabled aria-label={checked ? 'Completed task' : 'Incomplete task'} />
}

const components = {
  h1: 'h2',
  h2: 'h3',
  h3: 'h4',
  h4: 'h5',
  h5: 'h6',
  h6: 'h6',
  a: MarkdownLink,
  img: MarkdownImage,
  input: TaskCheckbox,
  pre: CodeBlock,
  table: MarkdownTable,
}
const remarkPlugins = [remarkGfm, remarkLiteralCode]

function MarkdownResponse({ text }) {
  return (
    <div className="studio-assistant-markdown">
      <div className="studio-markdown">
        <ReactMarkdown remarkPlugins={remarkPlugins} components={components} skipHtml>
          {text}
        </ReactMarkdown>
      </div>
      <div className="studio-response-actions">
        <CopyAction text={text} kind="response" />
      </div>
    </div>
  )
}

export default function AssistantMarkdown({ text, withheld = false, expired = false }) {
  if (withheld || expired || typeof text !== 'string' || !text.trim()) return null

  // Remount feedback when the retained response changes, including after revocation.
  return <MarkdownResponse key={text} text={text} />
}
