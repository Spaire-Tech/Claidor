'use client'

import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined'
import AutoFixHighOutlined from '@mui/icons-material/AutoFixHighOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import { cn } from '@spaire/ui/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@spaire/ui/components/ui/dialog'
import { useCallback, useEffect, useRef, useState } from 'react'

export type FrameStyle =
  | 'browser_dark'
  | 'browser_light'
  | 'floating_dark'
  | 'floating_light'

const CANVAS_W = 1200
const CANVAS_H = 750

const FRAME_OPTIONS: {
  id: FrameStyle
  label: string
  description: string
  bgClass: string
}[] = [
  {
    id: 'browser_dark',
    label: 'Dark Browser',
    description: 'Edge-to-edge dark chrome',
    bgClass: 'bg-[#0f0f10]',
  },
  {
    id: 'browser_light',
    label: 'Light Browser',
    description: 'Edge-to-edge light chrome',
    bgClass: 'bg-[#f5f5f7]',
  },
  {
    id: 'floating_dark',
    label: 'Dark Floating',
    description: 'Floating window on dark gradient',
    bgClass: 'bg-gradient-to-br from-[#0a0a0f] to-[#0f0a1e]',
  },
  {
    id: 'floating_light',
    label: 'Light Floating',
    description: 'Floating window on light gradient',
    bgClass: 'bg-gradient-to-br from-[#f0f4ff] to-[#faf0ff]',
  },
]

function drawRoundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawBrowserChrome(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  barH: number,
  dark: boolean,
) {
  const barBg = dark ? '#1c1c1e' : '#e8e8ed'
  const urlBg = dark ? '#2c2c2e' : '#d1d1d6'
  const separator = dark ? '#303032' : '#c8c8ce'

  ctx.fillStyle = barBg
  ctx.fillRect(x, y, w, barH)

  const dotY = y + barH / 2
  const dots: [string, number][] = [
    ['#ff5f57', x + 22],
    ['#febc2e', x + 46],
    ['#28c840', x + 70],
  ]
  for (const [color, dotX] of dots) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(dotX, dotY, 6.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = urlBg
  drawRoundRectPath(ctx, x + 100, y + barH / 2 - 11, w - 200, 22, 5)
  ctx.fill()

  ctx.fillStyle = separator
  ctx.fillRect(x, y + barH, w, 1)
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  style: FrameStyle,
) {
  const W = CANVAS_W
  const H = CANVAS_H
  ctx.clearRect(0, 0, W, H)

  if (style === 'browser_dark' || style === 'browser_light') {
    const dark = style === 'browser_dark'
    const barH = 52
    const bg = dark ? '#0f0f10' : '#f5f5f7'

    ctx.save()
    drawRoundRectPath(ctx, 0, 0, W, H, 16)
    ctx.clip()

    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    drawBrowserChrome(ctx, 0, 0, W, barH, dark)

    if (img) {
      ctx.drawImage(img, 0, barH + 1, W, H - barH - 1)
    } else {
      ctx.fillStyle = dark ? '#1a1a1c' : '#ebebef'
      ctx.fillRect(0, barH + 1, W, H - barH - 1)
    }
    ctx.restore()
  } else {
    const dark = style === 'floating_dark'
    const pad = 56
    const winX = pad
    const winY = pad
    const winW = W - pad * 2
    const winH = H - pad * 2
    const winR = 12
    const barH = 44

    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, W, H)
    if (dark) {
      grad.addColorStop(0, '#0a0a0f')
      grad.addColorStop(0.5, '#0f0a1e')
      grad.addColorStop(1, '#0a0f0a')
    } else {
      grad.addColorStop(0, '#f0f4ff')
      grad.addColorStop(0.5, '#faf0ff')
      grad.addColorStop(1, '#f0fff8')
    }
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // Shadow beneath window
    ctx.save()
    ctx.shadowColor = dark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.18)'
    ctx.shadowBlur = 50
    ctx.shadowOffsetY = 18
    ctx.fillStyle = dark ? '#1c1c1e' : '#ffffff'
    drawRoundRectPath(ctx, winX, winY, winW, winH, winR)
    ctx.fill()
    ctx.restore()

    // Clip and draw window contents
    ctx.save()
    drawRoundRectPath(ctx, winX, winY, winW, winH, winR)
    ctx.clip()

    ctx.fillStyle = dark ? '#0f0f10' : '#f5f5f7'
    ctx.fillRect(winX, winY, winW, winH)

    drawBrowserChrome(ctx, winX, winY, winW, barH, dark)

    if (img) {
      ctx.drawImage(img, winX, winY + barH + 1, winW, winH - barH - 1)
    } else {
      ctx.fillStyle = dark ? '#1a1a1c' : '#ebebef'
      ctx.fillRect(winX, winY + barH + 1, winW, winH - barH - 1)
    }
    ctx.restore()
  }
}

interface ProductMockupGeneratorProps {
  open: boolean
  onClose: () => void
  onUploadFile: (file: File) => void
}

export const ProductMockupGenerator = ({
  open,
  onClose,
  onUploadFile,
}: ProductMockupGeneratorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [screenshot, setScreenshot] = useState<HTMLImageElement | null>(null)
  const [frameStyle, setFrameStyle] = useState<FrameStyle>('browser_dark')
  const [isUploading, setIsUploading] = useState(false)
  const [added, setAdded] = useState(false)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.save()
    drawFrame(ctx, screenshot, frameStyle)
    ctx.restore()
  }, [screenshot, frameStyle])

  useEffect(() => {
    redraw()
  }, [redraw])

  // Draw placeholder frame on open
  useEffect(() => {
    if (open) {
      redraw()
    }
  }, [open, redraw])

  const handleScreenshotChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      img.onload = () => {
        setScreenshot(img)
        URL.revokeObjectURL(objectUrl)
      }
      img.src = objectUrl
      // Reset input so the same file can be re-selected
      e.target.value = ''
    },
    [],
  )

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'product-mockup.png'
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [])

  const handleUseAsMockup = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setIsUploading(true)
    canvas.toBlob((blob) => {
      if (!blob) {
        setIsUploading(false)
        return
      }
      const file = new File([blob], `mockup-${Date.now()}.png`, {
        type: 'image/png',
      })
      onUploadFile(file)
      setIsUploading(false)
      setAdded(true)
      setTimeout(() => {
        setAdded(false)
        onClose()
      }, 900)
    }, 'image/png')
  }, [onUploadFile, onClose])

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent className=" max-w-4xl gap-5 border-gray-200 bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <AutoFixHighOutlined fontSize="small" />
            Generate Product Mockup
          </DialogTitle>
        </DialogHeader>

        {/* Frame style selector */}
        <div className="grid grid-cols-4 gap-2">
          {FRAME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFrameStyle(opt.id)}
              className={cn(
                'flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all',
                frameStyle === opt.id
                  ? 'border-blue-500 bg-blue-50'
                  : ' border-gray-200 hover:border-gray-300',
              )}
            >
              {/* Mini frame preview */}
              <div
                className={cn(
                  'h-6 w-full rounded-md',
                  opt.bgClass,
                )}
              />
              <span className="text-xs font-medium text-gray-900">
                {opt.label}
              </span>
              <span className=" text-[11px] leading-tight text-gray-500">
                {opt.description}
              </span>
            </button>
          ))}
        </div>

        {/* Canvas preview */}
        <div className=" relative overflow-hidden rounded-xl bg-gray-100">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="w-full"
          />
          {!screenshot && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
              <p className=" rounded-md bg-black/20 px-3 py-1.5 text-sm text-gray-600 backdrop-blur-sm ">
                Upload a screenshot to preview your mockup
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleScreenshotChange}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <AddPhotoAlternateOutlined fontSize="small" className="mr-1.5" />
            {screenshot ? 'Replace Screenshot' : 'Upload Screenshot'}
          </Button>

          <div className="flex-1" />

          {screenshot && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownload}
              >
                <DownloadOutlined fontSize="small" className="mr-1.5" />
                Download
              </Button>
              <Button
                type="button"
                onClick={handleUseAsMockup}
                loading={isUploading}
                disabled={isUploading || added}
              >
                {added ? (
                  <>
                    <CheckOutlined fontSize="small" className="mr-1.5" />
                    Added!
                  </>
                ) : (
                  'Use as Product Media'
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
