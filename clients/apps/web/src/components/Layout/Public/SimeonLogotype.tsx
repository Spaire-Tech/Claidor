'use client'

import LogoIcon from '@/components/Brand/LogoIcon'
import LogoType from '@/components/Brand/LogoType'

import { useOutsideClick } from '@/utils/useOutsideClick'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@simeon/ui/components/ui/dropdown-menu'
import { ArrowDown, Clipboard } from 'lucide-react'
import Link from 'next/link'
import { MouseEventHandler, useCallback, useRef, useState } from 'react'
import { twMerge } from 'tailwind-merge'

export const SimeonLogotype = ({
  logoVariant = 'icon',
  size,
  className,
  logoClassName,
  href,
}: {
  logoVariant?: 'icon' | 'logotype'
  size?: number
  className?: string
  logoClassName?: string
  href?: string
}) => {
  const SimeonLogotypeRef = useRef<HTMLDivElement>(null)

  useOutsideClick([SimeonLogotypeRef], () => setSimeonLogotypeOpen(false))

  const [SimeonLogotypeOpen, setSimeonLogotypeOpen] = useState(false)

  const handleTriggerClick: MouseEventHandler<HTMLElement> = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      setSimeonLogotypeOpen(true)
    },
    [],
  )

  const handleCopyLogoToClipboard = useCallback(() => {
    navigator.clipboard.writeText(
      logoVariant === 'icon' ? SimeonIconSVGString : SimeonLogoSVGString,
    )
    setSimeonLogotypeOpen(false)
  }, [logoVariant])

  const LogoComponent =
    logoVariant === 'logotype' ? (
      <LogoType
        className={twMerge('-ml-2 text-black md:ml-0', logoClassName)}
        width={size ?? 100}
      />
    ) : (
      <LogoIcon
        className={twMerge('text-black', logoClassName)}
        size={size ?? 42}
      />
    )

  return (
    <div className={twMerge('relative flex flex-row items-center', className)}>
      <DropdownMenu open={SimeonLogotypeOpen}>
        <DropdownMenuTrigger onContextMenu={handleTriggerClick}>
          {href ? (
            <Link href={href}>{LogoComponent}</Link>
          ) : (
            <div>{LogoComponent}</div>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent ref={SimeonLogotypeRef} align="start">
          <DropdownMenuItem
            className="flex flex-row gap-x-3"
            onClick={handleCopyLogoToClipboard}
          >
            <Clipboard className="h-3 w-3" />
            <span>Copy Logo as SVG</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex flex-row gap-x-3"
            onClick={() => setSimeonLogotypeOpen(false)}
          >
            <ArrowDown className="h-3 w-3" />
            <Link href="/assets/brand/simeon_brand.zip">
              Download Branding Assets
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

const SimeonIconSVGString = ''

const SimeonLogoSVGString = ''
