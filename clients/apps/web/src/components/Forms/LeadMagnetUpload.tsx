'use client'

import { Upload } from '@/components/FileUpload/Upload'
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined'
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import { useCallback, useRef, useState } from 'react'

export interface LeadMagnetUploadProps {
  organization: schemas['Organization']
  fileName: string | null
  onChange: (fileId: string | null, fileName: string | null) => void
}

export const LeadMagnetUpload = ({
  organization,
  fileName,
  onChange,
}: LeadMagnetUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleFile = useCallback(
    (file: File) => {
      setUploading(true)
      setProgress(0)
      const upload = new Upload({
        organization,
        service: 'downloadable',
        file,
        onFileProcessing: () => {},
        onFileCreate: () => {},
        onFileUploadProgress: (f, uploaded) => {
          if (f.size > 0) setProgress(Math.round((uploaded / f.size) * 100))
        },
        onFileUploaded: (response) => {
          setUploading(false)
          setProgress(100)
          onChange(response.id, response.name)
        },
        onFileError: () => setUploading(false),
      })
      upload.run().catch(() => setUploading(false))
    },
    [organization, onChange],
  )

  if (fileName) {
    return (
      <div className="flex flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex min-w-0 flex-row items-center gap-2">
          <InsertDriveFileOutlined fontSize="small" className="text-gray-500" />
          <span className="truncate text-sm text-gray-900">{fileName}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null, null)}
        >
          Remove
        </Button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-8 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
    >
      <FileUploadOutlined />
      <span className="text-sm">
        {uploading
          ? `Uploading… ${progress}%`
          : 'Upload your guide, PDF or file'}
      </span>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </button>
  )
}
