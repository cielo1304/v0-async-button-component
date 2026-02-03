import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const carId = formData.get('carId') as string
    const mediaType = formData.get('mediaType') as string || 'PHOTO'
    const docType = formData.get('docType') as string || null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Генерируем уникальное имя файла
    const timestamp = Date.now()
    const ext = file.name.split('.').pop()
    const folder = mediaType === 'DOCUMENT' ? 'documents' : 'photos'
    const filename = `cars/${carId}/${folder}/${timestamp}.${ext}`

    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
    })

    return NextResponse.json({
      url: blob.url,
      filename: file.name,
      size: file.size,
      type: file.type,
      mediaType,
      docType,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
