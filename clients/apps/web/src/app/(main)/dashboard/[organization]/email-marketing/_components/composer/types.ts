// Block / draft types shared across composer files.

export type BlockType =
  | 'text'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'quote'
  | 'bullet'
  | 'numbered'
  | 'image'
  | 'button'
  | 'divider'
  | 'file'

export type Align = 'left' | 'center' | 'right' | 'full'
/** Subset valid as a CSS `text-align` value (no 'full'). */
export type TextAlign = 'left' | 'center' | 'right'
export type Crop = 'orig' | 'square' | 'wide' | 'classic'

export type Block =
  | { id: string; type: 'text' | 'h1' | 'h2' | 'h3' | 'quote'; html: string; talign?: TextAlign }
  | { id: string; type: 'bullet' | 'numbered'; items: string[]; talign?: TextAlign }
  | {
      id: string
      type: 'image'
      src: string
      caption: string
      alt: string
      link: string
      align: Exclude<Align, 'right'>
      crop: Crop
      linkEdit?: boolean
    }
  | {
      id: string
      type: 'button'
      text: string
      link: string
      align: TextAlign
      /** Background colour (default black). Inline-styled on render. */
      bg?: string
      /** Text colour (default white). */
      color?: string
    }
  | { id: string; type: 'divider' }
  | { id: string; type: 'file'; name: string; size: string; url?: string }

export type Attachment = { name: string; size: string; url?: string }

export type SendOptionsState = {
  replyTo: 'self' | 'support' | 'noreply'
  schedule: boolean
  date: string
  time: string
  tracking: boolean
  webVersion: boolean
  labels: string[]
  customTags: string[]
}

export const TEXTLIKE: BlockType[] = [
  'text',
  'h1',
  'h2',
  'h3',
  'quote',
  'bullet',
  'numbered',
]
export const CROP_AR: Record<Crop, string | null> = {
  orig: null,
  square: '1 / 1',
  wide: '16 / 9',
  classic: '4 / 3',
}
export const CROP_SEQ: Crop[] = ['orig', 'square', 'wide', 'classic']
export const CROP_LABEL: Record<Crop, string> = {
  orig: 'Original',
  square: 'Square',
  wide: '16:9',
  classic: '4:3',
}

let _mid = 200
export const muid = () => 'm' + ++_mid

export const defaultBlock = (type: BlockType): Block => {
  switch (type) {
    case 'text':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'quote':
      return { id: muid(), type, html: '' }
    case 'bullet':
    case 'numbered':
      return { id: muid(), type, items: [''] }
    case 'image':
      return {
        id: muid(),
        type: 'image',
        src: '',
        caption: '',
        alt: '',
        link: '',
        align: 'center',
        crop: 'orig',
      }
    case 'button':
      return {
        id: muid(),
        type: 'button',
        text: 'View the doc',
        link: '',
        align: 'left',
        bg: '#000000',
        color: '#ffffff',
      }
    case 'divider':
      return { id: muid(), type: 'divider' }
    case 'file':
      return { id: muid(), type: 'file', name: 'Untitled file', size: '0 KB' }
  }
}

// Empty starter — single blank paragraph. The "June at the studio" demo
// content from the design handoff doesn't ship to creators.
export const INITIAL_BLOCKS: Block[] = [
  { id: 'm1', type: 'text', html: '' },
]

export const readFileAsDataURL = (file: File, cb: (url: string) => void) => {
  const r = new FileReader()
  r.onload = () => cb(r.result as string)
  r.readAsDataURL(file)
}
