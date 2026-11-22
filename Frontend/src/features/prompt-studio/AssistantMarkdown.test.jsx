import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import AssistantMarkdown from './AssistantMarkdown'

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  return writeText
}

describe('assistant Markdown structure', () => {
  test('renders readable Markdown and GFM without introducing another page heading', () => {
    const { container } = render(<AssistantMarkdown text={`# Release plan

## Next steps

Read **carefully**, use *emphasis* and ~~remove this~~ with \`status\`.

1. Prepare
2. Review

- Share the result

> Keep the scope small.

- [x] Scope agreed
- [ ] Review complete

| Milestone | Output |
| --- | --- |
| Prepare | Agreed scope |

See [the guide](https://example.com/guide) and https://example.com/help.
`} />)

    expect(screen.getByRole('heading', { name: 'Release plan', level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Next steps', level: 3 })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(container.querySelector('strong').textContent).toBe('carefully')
    expect(container.querySelector('em').textContent).toBe('emphasis')
    expect(container.querySelector('del').textContent).toBe('remove this')
    expect(container.querySelector('p code').textContent).toBe('status')
    expect(container.querySelectorAll('ol li')).toHaveLength(2)
    expect(container.querySelector('blockquote').textContent).toContain('Keep the scope small.')

    const tasks = screen.getAllByRole('checkbox')
    expect(tasks.map((task) => task.disabled)).toEqual([true, true])
    expect(tasks.map((task) => task.checked)).toEqual([true, false])
    fireEvent.click(tasks[1])
    expect(tasks[1].checked).toBe(false)

    const table = screen.getByRole('table')
    expect(table.querySelectorAll('th')).toHaveLength(2)
    expect(table.textContent).toContain('Agreed scope')
    expect(screen.getByRole('region', { name: 'Response table' }).tabIndex).toBe(0)
    expect(screen.getByRole('link', { name: 'the guide' }).getAttribute('href')).toBe('https://example.com/guide')
    expect(screen.getByRole('link', { name: 'https://example.com/help' })).toBeTruthy()
  })

  test('keeps long code in a named keyboard scroll region and inline code separate', () => {
    const literal = 'x'.repeat(800)
    const { container } = render(<AssistantMarkdown text={`Inline \`short\`.

\`\`\`json
${literal}
\`\`\``} />)

    const codeRegion = screen.getByRole('region', { name: 'json code' })
    expect(codeRegion.tabIndex).toBe(0)
    expect(codeRegion.tagName).toBe('PRE')
    expect(codeRegion.textContent).toBe(literal)
    expect(screen.getAllByRole('button', { name: 'Copy code' })).toHaveLength(1)
    expect(container.querySelector('p code').textContent).toBe('short')
    expect(container.querySelector('[data-studio-code]')).toBeNull()
  })

  test('handles an unclosed fence as literal code without crashing', async () => {
    const writeText = mockClipboard()
    const literal = 'const ready = true\n  trailing spaces  '
    render(<AssistantMarkdown text={`\`\`\`js\n${literal}`} />)

    expect(screen.getByRole('region', { name: 'js code' }).textContent).toBe(literal)
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(literal))
  })
})

describe('assistant Markdown safety', () => {
  test('never turns raw HTML into elements or executable attributes', () => {
    const { container } = render(<AssistantMarkdown text={`<script>window.stolen = true</script>

<iframe src="https://example.com/tracker"></iframe>

<img src="https://example.com/tracker.png" onerror="alert(1)">

<a href="javascript:alert(1)">Raw link</a>

Safe **response**.`} />)

    expect(container.querySelector('script, iframe, img, [onerror], [onclick]')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('response').tagName).toBe('STRONG')
  })

  test.each([
    'javascript:alert%281%29',
    'jAvAsCrIpT:alert%281%29',
    'javascript&#58;alert%281%29',
    'vbscript:msgbox%281%29',
    'data:text/html;base64,PHNjcmlwdD4=',
  ])('preserves the parser sanitizer for unsafe link %s', (url) => {
    const { container } = render(<AssistantMarkdown text={`[Unsafe destination](${url})`} />)
    expect(screen.getByText('Unsafe destination')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('[href]')).toBeNull()
  })

  test.each(['https://example.com/docs', 'mailto:help@example.com', '/guide', '#details'])('keeps safe link %s', (url) => {
    render(<AssistantMarkdown text={`[Safe destination](${url})`} />)
    const link = screen.getByRole('link', { name: 'Safe destination' })
    expect(link.getAttribute('href')).toBe(url)
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  test('renders image descriptions as explicit sanitized links without loading any image', () => {
    const { container } = render(<AssistantMarkdown text={`![Release diagram](https://example.com/private-image.png)

![Unsafe diagram](javascript:alert%281%29)

![](/image.png)`} />)

    expect(container.querySelector('img, picture, source')).toBeNull()
    expect(screen.getByRole('link', { name: 'Image: Release diagram' }).getAttribute('href')).toBe('https://example.com/private-image.png')
    expect(screen.getByRole('link', { name: 'Image: Image' }).getAttribute('href')).toBe('/image.png')
    expect(screen.getByText('Unsafe diagram (image unavailable)')).toBeTruthy()
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  test.each([
    { text: undefined },
    { text: null },
    { text: '' },
    { text: '  \n\t' },
    { text: 123 },
    { text: 'Restricted secret', withheld: true },
    { text: 'Expired secret', expired: true },
    { text: 'Protected secret', withheld: true, expired: true },
  ])('renders no content or copy actions for absent or protected text: %j', (props) => {
    const writeText = mockClipboard()
    const { container } = render(<AssistantMarkdown {...props} />)
    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('button')).toBeNull()
    expect(writeText).not.toHaveBeenCalled()
  })

  test.each(['withheld', 'expired'])('removes existing content immediately when it becomes %s', async (flag) => {
    let resolveCopy
    const writeText = mockClipboard(vi.fn(() => new Promise((resolve) => { resolveCopy = resolve })))
    const { container, rerender } = render(<AssistantMarkdown text="Retained response" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy response' }))
    expect(writeText).toHaveBeenCalledOnce()

    rerender(<AssistantMarkdown text="Retained response" {...{ [flag]: true }} />)
    expect(container.innerHTML).toBe('')
    await act(async () => { resolveCopy() })
    expect(container.innerHTML).toBe('')
  })
})

describe('literal clipboard behavior', () => {
  test('copies original Markdown including original line endings and outer whitespace', async () => {
    const writeText = mockClipboard()
    const text = '  # Original heading\r\n\r\nA **bold** response with `code`.  \r\n\r\n'
    render(<AssistantMarkdown text={text} />)
    const action = screen.getByRole('button', { name: 'Copy response' })

    fireEvent.click(action)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Response copied.'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(text)
    expect(screen.getByRole('button', { name: 'Copy response' })).toBe(action)
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
  })

  test('copies code indentation, tabs, trailing spaces and blank lines without trimming', async () => {
    const writeText = mockClipboard()
    const literal = '  first\tvalue  \n\n    second  \n\n'
    const text = `Before.\n\n\`\`\`text\n${literal}\n\`\`\`\n\nAfter.`
    render(<AssistantMarkdown text={text} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    await waitFor(() => expect(screen.getByText('Code copied.')).toBeTruthy())
    expect(writeText).toHaveBeenCalledExactlyOnceWith(literal)
    expect(screen.getByRole('region', { name: 'text code' }).textContent).toBe(literal)
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy()
  })

  test('copies each code block independently', async () => {
    const writeText = mockClipboard()
    render(<AssistantMarkdown text={'```\nfirst block\n```\n\n```\nsecond block\n```'} />)
    const actions = screen.getAllByRole('button', { name: 'Copy code' })

    fireEvent.click(actions[1])
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith('second block'))
    expect(screen.getAllByRole('status').filter((status) => status.textContent === 'Code copied.')).toHaveLength(1)
  })

  test('exposes copy failure and allows retry with the same action name', async () => {
    const writeText = mockClipboard(vi.fn().mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValue(undefined))
    render(<AssistantMarkdown text="A response" />)
    const action = screen.getByRole('button', { name: 'Copy response' })

    fireEvent.click(action)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Could not copy response. Select it and copy manually.'))
    expect(action.disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Copy response' })).toBe(action)
    fireEvent.click(action)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Response copied.'))
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  test('reports unavailable clipboard support for code without losing the literal code', async () => {
    vi.stubGlobal('navigator', {})
    render(<AssistantMarkdown text={'```\nselect this manually\n```'} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    await waitFor(() => expect(screen.getByText('Could not copy code. Select it and copy manually.')).toBeTruthy())
    expect(screen.getByRole('region', { name: 'Code block' }).textContent).toBe('select this manually')
  })

  test('disables repeated copy while pending and resets feedback when the response changes', async () => {
    let resolveCopy
    const writeText = mockClipboard(vi.fn(() => new Promise((resolve) => { resolveCopy = resolve })))
    const { rerender } = render(<AssistantMarkdown text="First response" />)
    const action = screen.getByRole('button', { name: 'Copy response' })

    fireEvent.click(action)
    fireEvent.click(action)
    expect(action.disabled).toBe(true)
    expect(writeText).toHaveBeenCalledOnce()
    await act(async () => { resolveCopy() })
    expect(screen.getByRole('status').textContent).toBe('Response copied.')

    rerender(<AssistantMarkdown text="Second response" />)
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.getByRole('button', { name: 'Copy response' }).disabled).toBe(false)
  })
})
