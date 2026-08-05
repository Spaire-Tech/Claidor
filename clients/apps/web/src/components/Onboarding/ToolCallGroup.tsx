/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { DynamicToolUIPart } from 'ai'
import { useState } from 'react'
import LogoIcon from '../Brand/LogoIcon'

function ensureJSONArgument<T>(callback: (a: T | undefined) => string) {
  return (arg: T | string) => {
    if (!arg) {
      return callback(undefined)
    }

    if (typeof arg === 'string') {
      try {
        return callback(JSON.parse(arg))
      } catch {
        return callback(undefined)
      }
    }

    if (
      typeof arg === 'object' &&
      'body' in arg &&
      typeof arg.body === 'string'
    ) {
      try {
        return callback({ ...arg, body: JSON.parse(arg.body) } as T)
      } catch {
        return callback(arg)
      }
    }

    return callback(arg)
  }
}

const TOOL_LABELS = {
  createProduct: {
    input: ensureJSONArgument((input?: { name?: string }) =>
      input?.name ? `Creating product "${input.name}"` : 'Creating product…',
    ),
    output: ensureJSONArgument((input?: { name?: string }) =>
      input?.name ? `Created product "${input.name}"` : 'Created product.',
    ),
    error: () => 'Error creating product.',
  },
  updateProductBenefits: {
    input: () => 'Assigning benefits to product…',
    output: () => 'Assigned benefits to product.',
    error: () => 'Error assigning benefits.',
  },
  createBenefit: {
    input: ensureJSONArgument((input?: { description?: string }) =>
      input?.description
        ? `Creating benefit "${input.description}"`
        : 'Creating benefit…',
    ),
    output: ensureJSONArgument((input?: { description?: string }) =>
      input?.description
        ? `Created benefit "${input.description}"`
        : 'Created benefit.',
    ),
    error: () => 'Error creating benefit.',
  },
  createMeter: {
    input: ensureJSONArgument((input?: { name?: string }) =>
      input?.name ? `Creating meter "${input.name}"` : 'Creating meter…',
    ),
    output: ensureJSONArgument((input?: { name?: string }) =>
      input?.name ? `Created meter "${input.name}"` : 'Created meter.',
    ),
    error: () => 'Error creating meter.',
  },
}

const getToolLabel = (part: DynamicToolUIPart): string => {
  switch (part.state) {
    case 'input-streaming':
      return (
        TOOL_LABELS[part.toolName as keyof typeof TOOL_LABELS]?.input?.(
          part.input as any,
        ) ?? 'Working my magic…'
      )

    case 'input-available':
      return (
        TOOL_LABELS[part.toolName as keyof typeof TOOL_LABELS]?.input?.(
          part.input as any,
        ) ?? 'Working my magic…'
      )
    case 'output-available':
      return (
        TOOL_LABELS[part.toolName as keyof typeof TOOL_LABELS]?.output?.(
          part.input as any,
        ) ?? ''
      )
    case 'output-error':
      return (
        TOOL_LABELS[part.toolName as keyof typeof TOOL_LABELS]?.error?.() ??
        'Something went wrong.'
      )
  }
}

export const ToolCallGroup = ({
  parts,
  messageId,
}: {
  parts: DynamicToolUIPart[]
  messageId: string
}) => {
  const [expanded, setExpanded] = useState(false)

  if (parts.length === 0) return null

  // Single tool - render directly
  if (parts.length === 1) {
    const part = parts[0]
    const label = getToolLabel(part)

    return (
      <p className=" not-prose flex items-center gap-1 text-gray-500">
        <LogoIcon size={24} className="-ml-1.5" />
        {label}
      </p>
    )
  }

  const lastPart = parts[parts.length - 1]
  const isComplete = lastPart.state === 'output-available'

  if (expanded) {
    return (
      <div className="not-prose flex flex-col gap-2">
        <button
          onClick={() => setExpanded(false)}
          className=" flex items-center gap-1 text-left text-gray-500 hover:text-gray-700"
        >
          <LogoIcon size={24} className="-ml-1.5" />
          <span>
            Took {parts.length} action{parts.length === 1 ? '' : 's'} to
            configure your account
          </span>
        </button>
        <div className=" ml-6 flex flex-col gap-1.5 border-l-2 border-gray-200 pl-4">
          {parts.map((part, index) => {
            const label = getToolLabel(part)
            return (
              <p
                key={`${messageId}-tool-${index}`}
                className=" flex items-center gap-1 text-sm text-gray-500"
              >
                {label}
              </p>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setExpanded(true)}
      className=" not-prose flex items-center gap-1 text-left text-gray-500 hover:text-gray-700"
      disabled={!isComplete}
    >
      <LogoIcon size={24} className="-ml-1.5" />
      {isComplete ? (
        <>
          <span>
            Took {parts.length} action{parts.length === 1 ? '' : 's'} to
            configure your account
          </span>
        </>
      ) : (
        <span>{getToolLabel(lastPart)}</span>
      )}
    </button>
  )
}
