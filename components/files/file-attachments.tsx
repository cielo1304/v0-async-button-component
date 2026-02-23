'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Upload,
  File,
  Image,
  FileText,
  Download,
  Trash2,
  Loader2,
  Eye,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  createUploadForEntityFile,
  commitUploadedEntityFile,
  listEntityFiles,
  getSignedViewUrl,
  deleteEntityFile,
} from '@/app/actions/files'

type EntityType = 'asset' | 'car'

interface FileAttachment {
  file_id: string
  kind: string
  original_name: string
  mime_type: string
  size_bytes: number
  created_at: string
  created_by: string
  sort_order: number
}

interface FileAttachmentsProps {
  entityType: EntityType
  entityId: string
  allowedKinds?: Array<{ value: string; label: string }>
  readOnly?: boolean
}

const DEFAULT_KINDS = [
  { value: 'photo', label: 'Фото' },
  { value: 'document', label: 'Документ' },
  { value: 'contract', label: 'Договор' },
  { value: 'certificate', label: 'Сертификат' },
  { value: 'pts', label: 'ПТС' },
  { value: 'sts', label: 'СТС' },
  { value: 'egrn', label: 'ЕГРН' },
  { value: 'plan', label: 'План' },
  { value: 'other', label: 'Прочее' },
]

export function FileAttachments({
  entityType,
  entityId,
  allowedKinds = DEFAULT_KINDS,
  readOnly = false,
}: FileAttachmentsProps) {
  const [files, setFiles] = useState<FileAttachment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedKind, setSelectedKind] = useState(allowedKinds[0]?.value || 'other')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await listEntityFiles({ entity_type: entityType, entity_id: entityId })
      if (result.success && result.files) {
        setFiles(result.files)
      } else {
        toast.error(result.error || 'Ошибка загрузки файлов')
      }
    } catch (error) {
      console.error('[v0] Error loading files:', error)
      toast.error('Ошибка загрузки файлов')
    } finally {
      setIsLoading(false)
    }
  }, [entityType, entityId])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Выберите файл')
      return
    }

    setIsUploading(true)
    try {
      // Step 1: Create upload URL
      const uploadResult = await createUploadForEntityFile({
        entity_type: entityType,
        entity_id: entityId,
        kind: selectedKind,
        filename: selectedFile.name,
        mime_type: selectedFile.type,
        size_bytes: selectedFile.size,
      })

      if (!uploadResult.success || !uploadResult.signed_upload_url) {
        toast.error(uploadResult.error || 'Ошибка создания upload URL')
        return
      }

      // Step 2: Upload file to storage
      const uploadResponse = await fetch(uploadResult.signed_upload_url, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type,
        },
      })

      if (!uploadResponse.ok) {
        toast.error('Ошибка загрузки файла в storage')
        return
      }

      // Step 3: Commit to database
      const commitResult = await commitUploadedEntityFile({
        file_id: uploadResult.file_id!,
        entity_type: entityType,
        entity_id: entityId,
        kind: selectedKind,
        bucket: uploadResult.bucket!,
        path: uploadResult.path!,
        original_name: selectedFile.name,
        mime_type: selectedFile.type,
        size_bytes: selectedFile.size,
      })

      if (!commitResult.success) {
        toast.error(commitResult.error || 'Ошибка сохранения метаданных')
        return
      }

      toast.success('Файл загружен')
      setIsUploadDialogOpen(false)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      loadFiles()
    } catch (error) {
      console.error('[v0] Upload error:', error)
      toast.error('Ошибка загрузки файла')
    } finally {
      setIsUploading(false)
    }
  }

  const handleView = async (file: FileAttachment) => {
    try {
      const result = await getSignedViewUrl(file.file_id)
      if (result.success && result.url) {
        window.open(result.url, '_blank')
      } else {
        toast.error(result.error || 'Ошибка получения URL')
      }
    } catch (error) {
      console.error('[v0] View error:', error)
      toast.error('Ошибка открытия файла')
    }
  }

  const handleDelete = async (file: FileAttachment) => {
    if (!confirm(`Удалить файл "${file.original_name}"?`)) return

    try {
      const result = await deleteEntityFile(file.file_id)
      if (result.success) {
        toast.success('Файл удалён')
        loadFiles()
      } else {
        toast.error(result.error || 'Ошибка удаления файла')
      }
    } catch (error) {
      console.error('[v0] Delete error:', error)
      toast.error('Ошибка удаления файла')
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (mime: string) => {
    if (mime.startsWith('image/')) return <Image className="h-5 w-5 text-blue-400" />
    if (mime.includes('pdf')) return <FileText className="h-5 w-5 text-red-400" />
    return <File className="h-5 w-5 text-muted-foreground" />
  }

  const getKindLabel = (kind: string): string => {
    return allowedKinds.find((k) => k.value === kind)?.label || kind
  }

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-foreground">Файлы</CardTitle>
            <CardDescription>Прикреплённые документы и изображения</CardDescription>
          </div>
          {!readOnly && (
            <Button size="sm" onClick={() => setIsUploadDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Загрузить
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Нет файлов
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.file_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">{getFileIcon(file.mime_type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {file.original_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {getKindLabel(file.kind)} • {formatFileSize(file.size_bytes)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleView(file)}
                      title="Открыть"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(file)}
                        title="Удалить"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Загрузить файл</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="kind">Тип файла</Label>
              <Select value={selectedKind} onValueChange={setSelectedKind}>
                <SelectTrigger id="kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedKinds.map((kind) => (
                    <SelectItem key={kind.value} value={kind.value}>
                      {kind.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">Файл</Label>
              <Input
                id="file"
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                disabled={isUploading}
              />
              {selectedFile && (
                <div className="text-sm text-muted-foreground">
                  {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsUploadDialogOpen(false)
                setSelectedFile(null)
                if (fileInputRef.current) {
                  fileInputRef.current.value = ''
                }
              }}
              disabled={isUploading}
            >
              Отмена
            </Button>
            <Button onClick={handleUpload} disabled={!selectedFile || isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Загрузка...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Загрузить
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
