'use client'

import React from "react"

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Upload, ImageIcon, FileText, X, Download, Trash2 } from 'lucide-react'

interface CarMediaUploadProps {
  carId: string
}

interface MediaFile {
  id: string
  file_url: string
  file_name: string
  media_type: string
  doc_type: string | null
  mime_type: string | null
  file_size: number | null
  uploaded_at: string
}

const DOC_TYPES = [
  { value: 'PASSPORT', label: 'Паспорт ТС (ПТС)' },
  { value: 'PTS', label: 'ПТС электронный' },
  { value: 'STS', label: 'СТС' },
  { value: 'DCP', label: 'ДКП' },
  { value: 'INSURANCE', label: 'Страховка' },
  { value: 'CONTRACT', label: 'Договор' },
  { value: 'OTHER', label: 'Другое' },
]

export function CarMediaUpload({ carId }: CarMediaUploadProps) {
  const [media, setMedia] = useState<MediaFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadType, setUploadType] = useState<'PHOTO' | 'DOCUMENT'>('PHOTO')
  const [docType, setDocType] = useState('OTHER')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    loadMedia()
  }, [carId])

  const loadMedia = async () => {
    try {
      const { data, error } = await supabase
        .from('auto_media')
        .select('*')
        .eq('car_id', carId)
        .order('uploaded_at', { ascending: false })

      if (error) throw error
      setMedia(data || [])
    } catch (error) {
      console.error('Error loading media:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('carId', carId)
        formData.append('mediaType', uploadType)
        if (uploadType === 'DOCUMENT') {
          formData.append('docType', docType)
        }

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) throw new Error('Upload failed')

        const result = await response.json()

        // Сохраняем в БД
        const { error } = await supabase.from('auto_media').insert({
          car_id: carId,
          media_type: uploadType,
          file_url: result.url,
          file_name: result.filename,
          mime_type: result.type,
          file_size: result.size,
          doc_type: uploadType === 'DOCUMENT' ? docType : null,
        })

        if (error) throw error
      }

      loadMedia()
    } catch (error) {
      console.error('Error uploading:', error)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDelete = async (mediaId: string, fileUrl: string) => {
    if (!confirm('Удалить файл?')) return

    try {
      // Удаляем из Vercel Blob
      await fetch('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: fileUrl }),
      })

      // Удаляем из БД
      await supabase.from('auto_media').delete().eq('id', mediaId)
      
      setMedia(media.filter(m => m.id !== mediaId))
    } catch (error) {
      console.error('Error deleting:', error)
    }
  }

  const photos = media.filter(m => m.media_type === 'PHOTO')
  const documents = media.filter(m => m.media_type === 'DOCUMENT')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Загрузка */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Загрузить файлы
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">Тип</span>
              <Select value={uploadType} onValueChange={(v) => setUploadType(v as 'PHOTO' | 'DOCUMENT')}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PHOTO">Фото</SelectItem>
                  <SelectItem value="DOCUMENT">Документ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {uploadType === 'DOCUMENT' && (
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">Тип документа</span>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map(dt => (
                      <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={uploadType === 'PHOTO' ? 'image/*' : '*/*'}
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Выбрать файлы
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Фотографии */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Фотографии ({photos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Фотографии не загружены</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {photos.map(photo => (
                <div key={photo.id} className="relative group">
                  <img
                    src={photo.file_url || "/placeholder.svg"}
                    alt={photo.file_name}
                    className="w-full aspect-square object-cover rounded-lg border border-border"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                    <a
                      href={photo.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-white/20 rounded-full hover:bg-white/30"
                    >
                      <Download className="h-4 w-4 text-white" />
                    </a>
                    <button
                      onClick={() => handleDelete(photo.id, photo.file_url)}
                      className="p-2 bg-red-500/50 rounded-full hover:bg-red-500/70"
                    >
                      <Trash2 className="h-4 w-4 text-white" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Документы */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Документы ({documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Документы не загружены</p>
          ) : (
            <div className="space-y-2">
              {documents.map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border"
                >
                  <div className="flex items-center gap-3">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-foreground">{doc.file_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {DOC_TYPES.find(d => d.value === doc.doc_type)?.label || 'Документ'}
                        {doc.file_size && ` • ${(doc.file_size / 1024).toFixed(1)} KB`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-secondary rounded"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => handleDelete(doc.id, doc.file_url)}
                      className="p-2 hover:bg-red-500/20 rounded text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
