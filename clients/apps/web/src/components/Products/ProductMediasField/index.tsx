import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined'
import { schemas } from '@spaire/client'
import { ReactNode, useCallback, useState } from 'react'
import { FileRejection } from 'react-dropzone'
import { twMerge } from 'tailwind-merge'
import { FileObject, useFileUpload } from '../../FileUpload'
import { toast } from '../../Toast/use-toast'
import { FileList } from './FileList'

const DropzoneView = ({
  isDragActive,
  children,
}: {
  isDragActive: boolean
  children: ReactNode
}) => {
  return (
    <>
      <div
        className={twMerge(
          'flex aspect-video w-full cursor-pointer items-center justify-center rounded-2xl border border-transparent px-4',
          isDragActive
            ? ' border-blue-100 bg-blue-50'
            : ' bg-gray-100',
        )}
      >
        <div className=" text-center text-gray-500">
          <div className="mb-4">
            <AddPhotoAlternateOutlined fontSize="medium" />
          </div>
          <p className=" text-xs font-medium text-gray-700">
            {isDragActive ? "Drop it like it's hot" : 'Add product media'}
          </p>
          <p className="mt-2 text-xs">
            Up to 10MB each. 16:9 ratio recommended for optimal display.
          </p>
        </div>
        {children}
      </div>
    </>
  )
}

interface ProductMediasFieldProps {
  organization: schemas['Organization']
  value: schemas['ProductMediaFileRead'][] | undefined
  onChange: (value: schemas['ProductMediaFileRead'][]) => void
}

const ProductMediasField = ({
  organization,
  value,
  onChange,
}: ProductMediasFieldProps) => {
  const onFilesUpdated = useCallback(
    (files: FileObject<schemas['ProductMediaFileRead']>[]) => {
      onChange(files.filter((file) => file.is_uploaded).map((file) => file))
    },
    [onChange],
  )

  const [filesRejected, setFilesRejected] = useState<FileRejection[]>([])

  const {
    files,
    setFiles,
    removeFile,
    uploadFile,
    getRootProps,
    getInputProps,
    isDragActive,
  } = useFileUpload({
    organization: organization,
    service: 'product_media',
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/gif': [],
      'image/webp': [],
      'image/svg+xml': [],
    },
    maxSize: 10 * 1024 * 1024,
    onFilesUpdated,
    onFilesRejected: setFilesRejected,
    onFileError: (_, error) => {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload file. Please try again.',
      })
    },
    initialFiles: value || [],
  })

  return (
    <>
      <div className="grid grid-cols-2 gap-3 [&>div>*]:aspect-video">
        <FileList files={files} setFiles={setFiles} removeFile={removeFile} />
        <div {...getRootProps()}>
          <DropzoneView isDragActive={isDragActive}>
            <input {...getInputProps()} />
          </DropzoneView>
        </div>
      </div>

      {filesRejected.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-100 p-4 text-red-800  ">
          {filesRejected.map((file) => (
            <p key={file.file.name}>
              {file.file.name} is not a valid image or is too large.
            </p>
          ))}
        </div>
      )}

    </>
  )
}

export default ProductMediasField
