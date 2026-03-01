'use server'

import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'
import { writeAuditLog } from '@/lib/audit'
import { assertNotReadOnly } from '@/lib/view-as'
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

type EntityType = 'asset' | 'car'

// Helper: sanitize filename
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 200)
}

// Helper: get company_id for authenticated user
async function getCompanyIdForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('team_members')
    .select('company_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error || !data?.company_id) {
    throw new Error('No team membership or company not selected')
  }

  return data.company_id
}

/**
 * Step 1: Create upload URL for an entity file
 * Returns: { file_id, bucket, path, signed_upload_url }
 */
export async function createUploadForEntityFile(params: {
  entity_type: EntityType
  entity_id: string
  kind: string
  filename: string
  mime_type: string
  size_bytes: number
}): Promise<{
  success: boolean
  file_id?: string
  bucket?: string
  path?: string
  signed_upload_url?: string
  error?: string
}> {
  await assertNotReadOnly()
  try {
    const { supabase, user } = await createSupabaseAndRequireUser()
    const companyId = await getCompanyIdForUser(supabase, user.id)

    // Verify entity exists and belongs to same company
    if (params.entity_type === 'asset') {
      const { data: asset, error } = await supabase
        .from('assets')
        .select('id, company_id')
        .eq('id', params.entity_id)
        .single()

      if (error || !asset) {
        return { success: false, error: 'Asset not found' }
      }
      if (!asset.company_id || asset.company_id !== companyId) {
        return { success: false, error: 'Access denied' }
      }
    } else if (params.entity_type === 'car') {
      const { data: car, error } = await supabase
        .from('cars')
        .select('id, company_id')
        .eq('id', params.entity_id)
        .single()

      if (error || !car) {
        return { success: false, error: 'Car not found' }
      }
      if (!car.company_id || car.company_id !== companyId) {
        return { success: false, error: 'Access denied' }
      }
    } else {
      return { success: false, error: 'Invalid entity type' }
    }

    // Generate file_id and storage path
    const file_id = randomUUID()
    const bucket = 'assets'
    const sanitized = sanitizeFilename(params.filename)
    const path = `company/${companyId}/${params.entity_type}/${params.entity_id}/${params.kind}/${file_id}-${sanitized}`

    // Create signed upload URL (60s TTL)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path)

    if (uploadError || !uploadData) {
      console.error('[v0] createSignedUploadUrl error:', uploadError)
      return { success: false, error: uploadError?.message || 'Failed to create upload URL' }
    }

    return {
      success: true,
      file_id,
      bucket,
      path,
      signed_upload_url: uploadData.signedUrl,
    }
  } catch (err: unknown) {
    console.error('[v0] createUploadForEntityFile error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Step 2: Commit uploaded file to database
 * Inserts into files + entity_files
 */
export async function commitUploadedEntityFile(params: {
  file_id: string
  entity_type: EntityType
  entity_id: string
  kind: string
  bucket: string
  path: string
  original_name: string
  mime_type: string
  size_bytes: number
}): Promise<{ success: boolean; error?: string }> {
  await assertNotReadOnly()
  try {
    const { supabase, user } = await createSupabaseAndRequireUser()
    const companyId = await getCompanyIdForUser(supabase, user.id)

    // Insert into files table
    const { error: fileError } = await supabase.from('files').insert({
      id: params.file_id,
      company_id: companyId,
      bucket: params.bucket,
      path: params.path,
      original_name: params.original_name,
      mime_type: params.mime_type,
      size_bytes: params.size_bytes,
      created_by: user.id,
    })

    if (fileError) {
      console.error('[v0] Insert into files error:', fileError)
      return { success: false, error: fileError.message }
    }

    // Insert into entity_files junction
    const { error: linkError } = await supabase.from('entity_files').insert({
      company_id: companyId,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      file_id: params.file_id,
      kind: params.kind,
      sort_order: 0,
    })

    if (linkError) {
      console.error('[v0] Insert into entity_files error:', linkError)
      // Cleanup: delete file record
      await supabase.from('files').delete().eq('id', params.file_id)
      return { success: false, error: linkError.message }
    }

    // Audit log
    await writeAuditLog(supabase, {
      actorEmployeeId: user.id,
      action: 'upload_file',
      module: 'files',
      entityTable: 'entity_files',
      entityId: params.file_id,
      after: params,
    })

    return { success: true }
  } catch (err: unknown) {
    console.error('[v0] commitUploadedEntityFile error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * List files for an entity (with metadata only)
 */
export async function listEntityFiles(params: {
  entity_type: EntityType
  entity_id: string
}): Promise<{
  success: boolean
  files?: Array<{
    file_id: string
    kind: string
    original_name: string
    mime_type: string
    size_bytes: number
    created_at: string
    created_by: string
    sort_order: number
  }>
  error?: string
}> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    const { data, error } = await supabase
      .from('entity_files')
      .select(
        `
        file_id,
        kind,
        sort_order,
        created_at,
        files!inner (
          original_name,
          mime_type,
          size_bytes,
          created_by,
          created_at
        )
      `
      )
      .eq('entity_type', params.entity_type)
      .eq('entity_id', params.entity_id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[v0] listEntityFiles error:', error)
      return { success: false, error: error.message }
    }

    const files = (data || []).map((row: any) => ({
      file_id: row.file_id,
      kind: row.kind,
      original_name: row.files.original_name,
      mime_type: row.files.mime_type,
      size_bytes: row.files.size_bytes,
      created_at: row.files.created_at,
      created_by: row.files.created_by,
      sort_order: row.sort_order,
    }))

    return { success: true, files }
  } catch (err: unknown) {
    console.error('[v0] listEntityFiles error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Get signed view URL for a file (10 min TTL)
 * Call this on-demand when user clicks to view/download
 */
export async function getSignedViewUrl(file_id: string): Promise<{
  success: boolean
  url?: string
  error?: string
}> {
  try {
    const { supabase } = await createSupabaseAndRequireUser()

    // Get file metadata
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('bucket, path')
      .eq('id', file_id)
      .single()

    if (fileError || !file) {
      return { success: false, error: 'File not found' }
    }

    // Create signed URL (10 min = 600s)
    const { data: urlData, error: urlError } = await supabase.storage
      .from(file.bucket)
      .createSignedUrl(file.path, 600)

    if (urlError || !urlData) {
      console.error('[v0] createSignedUrl error:', urlError)
      return { success: false, error: urlError?.message || 'Failed to create signed URL' }
    }

    return { success: true, url: urlData.signedUrl }
  } catch (err: unknown) {
    console.error('[v0] getSignedViewUrl error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Delete a file (removes from storage + DB)
 */
export async function deleteEntityFile(file_id: string): Promise<{
  success: boolean
  error?: string
}> {
  await assertNotReadOnly()
  try {
    const { supabase, user } = await createSupabaseAndRequireUser()

    // Get file info
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('bucket, path')
      .eq('id', file_id)
      .single()

    if (fileError || !file) {
      return { success: false, error: 'File not found' }
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(file.bucket)
      .remove([file.path])

    if (storageError) {
      console.error('[v0] Storage delete error:', storageError)
      // Continue anyway - may be already deleted
    }

    // Delete from DB (cascade will remove entity_files row)
    const { error: deleteError } = await supabase
      .from('files')
      .delete()
      .eq('id', file_id)

    if (deleteError) {
      console.error('[v0] Delete file error:', deleteError)
      return { success: false, error: deleteError.message }
    }

    // Audit log
    await writeAuditLog(supabase, {
      actorEmployeeId: user.id,
      action: 'delete_file',
      module: 'files',
      entityTable: 'files',
      entityId: file_id,
      before: file,
    })

    return { success: true }
  } catch (err: unknown) {
    console.error('[v0] deleteEntityFile error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
