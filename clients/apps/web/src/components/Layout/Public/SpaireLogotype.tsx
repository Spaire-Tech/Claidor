'use client'

import LogoIcon from '@/components/Brand/LogoIcon'
import LogoType from '@/components/Brand/LogoType'

import { useOutsideClick } from '@/utils/useOutsideClick'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@spaire/ui/components/ui/dropdown-menu'
import { ArrowDown, Clipboard } from 'lucide-react'
import Link from 'next/link'
import { MouseEventHandler, useCallback, useRef, useState } from 'react'
import { twMerge } from 'tailwind-merge'

export const SpaireLogotype = ({
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
  const SpaireLogotypeRef = useRef<HTMLDivElement>(null)

  useOutsideClick([SpaireLogotypeRef], () => setSpaireLogotypeOpen(false))

  const [SpaireLogotypeOpen, setSpaireLogotypeOpen] = useState(false)

  const handleTriggerClick: MouseEventHandler<HTMLElement> = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      setSpaireLogotypeOpen(true)
    },
    [],
  )

  const handleCopyLogoToClipboard = useCallback(() => {
    navigator.clipboard.writeText(
      logoVariant === 'icon' ? SpaireIconSVGString : SpaireLogoSVGString,
    )
    setSpaireLogotypeOpen(false)
  }, [logoVariant])

  const LogoComponent =
    logoVariant === 'logotype' ? (
      <LogoType
        className={twMerge(
          '-ml-2 text-black md:ml-0',
          logoClassName,
        )}
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
      <DropdownMenu open={SpaireLogotypeOpen}>
        <DropdownMenuTrigger onContextMenu={handleTriggerClick}>
          {href ? (
            <Link href={href}>{LogoComponent}</Link>
          ) : (
            <div>{LogoComponent}</div>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent ref={SpaireLogotypeRef} align="start">
          <DropdownMenuItem
            className="flex flex-row gap-x-3"
            onClick={handleCopyLogoToClipboard}
          >
            <Clipboard className="h-3 w-3" />
            <span>Copy Logo as SVG</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex flex-row gap-x-3"
            onClick={() => setSpaireLogotypeOpen(false)}
          >
            <ArrowDown className="h-3 w-3" />
            <Link href="/assets/brand/spaire_brand.zip">
              Download Branding Assets
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

const SpaireIconSVGString = ''

const SpaireLogoSVGString = ''
