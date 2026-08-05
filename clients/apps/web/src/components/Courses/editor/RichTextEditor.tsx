'use client'

import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import FormatBoldOutlined from '@mui/icons-material/FormatBoldOutlined'
import FormatItalicOutlined from '@mui/icons-material/FormatItalicOutlined'
import FormatListBulletedOutlined from '@mui/icons-material/FormatListBulletedOutlined'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
import FormatQuoteOutlined from '@mui/icons-material/FormatQuoteOutlined'
import InsertLinkOutlined from '@mui/icons-material/InsertLinkOutlined'
import StopOutlined from '@mui/icons-material/StopOutlined'
import StrikethroughSOutlined from '@mui/icons-material/StrikethroughSOutlined'
import { cn } from '@spaire/ui/lib/utils'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import { Markdown, type MarkdownStorage } from 'tiptap-markdown'

// tiptap-markdown ships a `MarkdownStorage` type but doesn't augment Tiptap's
// `Storage` interface, so `editor.storage.markdown` isn't known to TS under
// Tiptap v3's stricter typing. Read it through this typed accessor instead.
const getMarkdown = (editor: Editor): string => {
  const storage = editor.storage as { markdown?: MarkdownStorage }
  return storage.markdown?.getMarkdown() ?? editor.getText()
}

type Props = {
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  isGenerating?: boolean
  onGenerate?: () => void
  onStop?: () => void
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write your lesson content here…',
  isGenerating,
  onGenerate,
  onStop,
}: Props) {
  const editor = useEditor({
    extensions: [
      // Tiptap v3 StarterKit bundles Link (and Underline); configure it
      // inline instead of registering a second Link extension.
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          HTMLAttributes: { class: 'text-ce-accent underline' },
        },
      }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({
        html: false,
        breaks: true,
        transformPastedText: true,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none px-4 py-4 min-h-[280px] focus:outline-none ' +
          'prose-headings:font-semibold prose-p:my-2 prose-ul:my-2 prose-ol:my-2',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(getMarkdown(editor))
    },
    immediatelyRender: false,
  })

  // Keep editor in sync when value changes from outside (e.g. AI streaming, lesson switch).
  const lastEmittedRef = useRef<string>(value)
  useEffect(() => {
    if (!editor) return
    if (value === lastEmittedRef.current) return
    const current = getMarkdown(editor)
    if (value === current) return
    editor.commands.setContent(value, { emitUpdate: false })
    lastEmittedRef.current = value
  }, [value, editor])

  return (
    <div className="overflow-hidden rounded-xl border border-gray-300">
      <Toolbar
        editor={editor}
        isGenerating={isGenerating}
        onGenerate={onGenerate}
        onStop={onStop}
        hasContent={value.trim().length > 0}
      />
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({
  editor,
  isGenerating,
  onGenerate,
  onStop,
  hasContent,
}: {
  editor: Editor | null
  isGenerating?: boolean
  onGenerate?: () => void
  onStop?: () => void
  hasContent: boolean
}) {
  if (!editor) {
    return (
      <div className="h-10 border-b border-gray-200 bg-gray-50" aria-hidden />
    )
  }

  const insertLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', previous ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-3 py-2 text-gray-500">
      <BlockSelect editor={editor} />
      <Divider />
      <Btn
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <FormatBoldOutlined sx={{ fontSize: 16 }} />
      </Btn>
      <Btn
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <FormatItalicOutlined sx={{ fontSize: 16 }} />
      </Btn>
      <Btn
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <StrikethroughSOutlined sx={{ fontSize: 16 }} />
      </Btn>
      <Divider />
      <Btn
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <FormatListBulletedOutlined sx={{ fontSize: 16 }} />
      </Btn>
      <Btn
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        <FormatListNumberedOutlined sx={{ fontSize: 16 }} />
      </Btn>
      <Btn
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Quote"
      >
        <FormatQuoteOutlined sx={{ fontSize: 16 }} />
      </Btn>
      <Divider />
      <Btn
        active={editor.isActive('link')}
        onClick={insertLink}
        title="Insert link"
      >
        <InsertLinkOutlined sx={{ fontSize: 16 }} />
      </Btn>

      <div className="ml-auto flex items-center gap-1">
        {isGenerating ? (
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            <StopOutlined sx={{ fontSize: 14 }} />
            Stop
          </button>
        ) : onGenerate ? (
          <button
            type="button"
            onClick={onGenerate}
            className="border-ce-accent-border bg-ce-accent-tint text-ce-accent hover:bg-ce-accent-tint-strong flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium"
          >
            <AutoAwesomeOutlined sx={{ fontSize: 14 }} />
            {hasContent ? 'Regenerate' : 'Generate'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function BlockSelect({ editor }: { editor: Editor }) {
  const value = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : 'p'

  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value
        const chain = editor.chain().focus()
        if (v === 'p') chain.setParagraph().run()
        else
          chain
            .toggleHeading({ level: parseInt(v.slice(1)) as 1 | 2 | 3 })
            .run()
      }}
      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
    >
      <option value="p">Paragraph</option>
      <option value="h1">Heading 1</option>
      <option value="h2">Heading 2</option>
      <option value="h3">Heading 3</option>
    </select>
  )
}

function Btn({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium transition-colors',
        active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100',
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-gray-200" />
}
