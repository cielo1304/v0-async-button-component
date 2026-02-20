'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/supabase/require-user'
import { revalidatePath } from 'next/cache'

// ================================================
// Search Contacts
// ================================================

export async function searchContacts(query: string, limit = 20) {
  await requireUser()
  const supabase = await createClient()

  const q = query.trim()
  if (!q) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, display_name, nickname, mobile_phone, extra_phones, organization')
      .order('display_name')
      .limit(limit)

    if (error) throw new Error(error.message)
    return (data || []).map(c => ({
      id: c.id,
      display_name: c.display_name,
      nickname: c.nickname,
      phones: [c.mobile_phone, ...(c.extra_phones || [])].filter(Boolean) as string[],
      organization: c.organization,
    }))
  }

  // Search by name, phone, organization, and extra_phones
  // Using OR filters with ILIKE for flexible matching
  const likePattern = `%${q}%`
  const digitsOnly = q.replace(/\D/g, '')

  // Build filter: display_name ILIKE OR organization ILIKE OR mobile_phone contains digits
  let queryBuilder = supabase
    .from('contacts')
    .select('id, display_name, nickname, mobile_phone, extra_phones, organization')

  if (digitsOnly.length >= 3) {
    // If query looks like a phone number, search phone fields too
    queryBuilder = queryBuilder.or(
      `display_name.ilike.${likePattern},nickname.ilike.${likePattern},organization.ilike.${likePattern},mobile_phone.ilike.%${digitsOnly}%`
    )
  } else {
    queryBuilder = queryBuilder.or(
      `display_name.ilike.${likePattern},nickname.ilike.${likePattern},organization.ilike.${likePattern}`
    )
  }

  const { data, error } = await queryBuilder
    .order('display_name')
    .limit(limit)

  if (error) throw new Error(error.message)

  // Post-filter: also check extra_phones array (can't do array ILIKE in PostgREST easily)
  let results = data || []
  if (digitsOnly.length >= 3) {
    // Include contacts where extra_phones contains the digit pattern
    const { data: extraPhoneMatches } = await supabase
      .from('contacts')
      .select('id, display_name, mobile_phone, extra_phones, organization')
      .contains('extra_phones', []) // just to get all, we'll filter in JS
      .order('display_name')
      .limit(200)

    if (extraPhoneMatches) {
      const matchedIds = new Set(results.map(r => r.id))
      for (const c of extraPhoneMatches) {
        if (!matchedIds.has(c.id) && c.extra_phones?.some((p: string) => p.replace(/\D/g, '').includes(digitsOnly))) {
          results.push(c)
          matchedIds.add(c.id)
        }
      }
    }
  }

  return results.slice(0, limit).map(c => ({
    id: c.id,
    display_name: c.display_name,
    nickname: c.nickname,
    phones: [c.mobile_phone, ...(c.extra_phones || [])].filter(Boolean) as string[],
    organization: c.organization,
  }))
}

// ================================================
// Create Contact
// ================================================

export interface CreateContactPayload {
  first_name: string
  last_name?: string
  nickname?: string
  mobile_phone?: string
  extra_phones?: string[]
  organization?: string
  comment?: string
}

export async function createContact(payload: CreateContactPayload) {
  await requireUser()
  const supabase = await createClient()

  const firstName = payload.first_name.trim()
  if (!firstName) {
    throw new Error('Имя обязательно для заполнения')
  }

  // Build display_name: "Имя Фамилия (Псевдоним)"
  let displayName = [firstName, payload.last_name?.trim()]
    .filter(Boolean)
    .join(' ') || 'Без имени'
  if (payload.nickname?.trim()) {
    displayName += ` (${payload.nickname.trim()})`
  }

  // Clean extra_phones: remove empty strings
  const extraPhones = (payload.extra_phones || [])
    .map(p => p.trim())
    .filter(Boolean)

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      display_name: displayName,
      first_name: firstName,
      last_name: payload.last_name?.trim() || null,
      nickname: payload.nickname?.trim() || null,
      mobile_phone: payload.mobile_phone?.trim() || null,
      extra_phones: extraPhones,
      organization: payload.organization?.trim() || null,
      comment: payload.comment?.trim() || null,
    })
    .select('id, display_name, mobile_phone, extra_phones')
    .single()

  if (error) throw new Error(error.message)

  // Also create a contact_channel entry for the mobile_phone (backwards compat)
  if (payload.mobile_phone?.trim()) {
    const normalized = payload.mobile_phone.replace(/\D/g, '')
    await supabase.from('contact_channels').insert({
      contact_id: contact.id,
      type: 'phone',
      value: payload.mobile_phone.trim(),
      normalized,
      is_primary: true,
    })
  }

  revalidatePath('/contacts')

  return {
    id: contact.id,
    display_name: contact.display_name,
    phones: [contact.mobile_phone, ...(contact.extra_phones || [])].filter(Boolean) as string[],
  }
}

// ================================================
// Update Contact
// ================================================

export interface UpdateContactPayload {
  id: string
  first_name?: string
  last_name?: string
  nickname?: string
  mobile_phone?: string
  extra_phones?: string[]
  organization?: string
  comment?: string
  display_name?: string
  notes?: string
}

export async function updateContact(payload: UpdateContactPayload) {
  await requireUser()
  const supabase = await createClient()

  const { id, ...fields } = payload

  // Build update object, only include provided fields
  const updateData: Record<string, unknown> = {}

  if (fields.first_name !== undefined) updateData.first_name = fields.first_name.trim() || null
  if (fields.last_name !== undefined) updateData.last_name = fields.last_name.trim() || null
  if (fields.nickname !== undefined) updateData.nickname = fields.nickname.trim() || null
  if (fields.mobile_phone !== undefined) updateData.mobile_phone = fields.mobile_phone.trim() || null
  if (fields.organization !== undefined) updateData.organization = fields.organization.trim() || null
  if (fields.comment !== undefined) updateData.comment = fields.comment.trim() || null
  if (fields.notes !== undefined) updateData.notes = fields.notes.trim() || null
  if (fields.extra_phones !== undefined) {
    updateData.extra_phones = fields.extra_phones.map(p => p.trim()).filter(Boolean)
  }

  // Recompute display_name if name/nickname fields changed
  if (fields.first_name !== undefined || fields.last_name !== undefined || fields.nickname !== undefined) {
    // Fetch existing to merge
    const { data: existing } = await supabase
      .from('contacts')
      .select('first_name, last_name, nickname')
      .eq('id', id)
      .single()

    const fn = fields.first_name !== undefined ? fields.first_name.trim() : (existing?.first_name || '')
    const ln = fields.last_name !== undefined ? fields.last_name.trim() : (existing?.last_name || '')
    const nick = fields.nickname !== undefined ? fields.nickname.trim() : (existing?.nickname || '')
    let displayName = [fn, ln].filter(Boolean).join(' ') || 'Без имени'
    if (nick) displayName += ` (${nick})`
    updateData.display_name = fields.display_name || displayName
  } else if (fields.display_name !== undefined) {
    updateData.display_name = fields.display_name.trim()
  }

  updateData.updated_at = new Date().toISOString()

  const { data: contact, error } = await supabase
    .from('contacts')
    .update(updateData)
    .eq('id', id)
    .select('id, display_name, mobile_phone, extra_phones')
    .single()

  if (error) throw new Error(error.message)

  // Sync primary phone channel if mobile_phone changed
  if (fields.mobile_phone !== undefined) {
    const phone = fields.mobile_phone.trim()
    if (phone) {
      const normalized = phone.replace(/\D/g, '')
      // Upsert: update existing primary phone or insert new
      const { data: existingChannel } = await supabase
        .from('contact_channels')
        .select('id')
        .eq('contact_id', id)
        .eq('type', 'phone')
        .eq('is_primary', true)
        .single()

      if (existingChannel) {
        await supabase
          .from('contact_channels')
          .update({ value: phone, normalized })
          .eq('id', existingChannel.id)
      } else {
        await supabase.from('contact_channels').insert({
          contact_id: id,
          type: 'phone',
          value: phone,
          normalized,
          is_primary: true,
        })
      }
    }
  }

  revalidatePath('/contacts')
  revalidatePath(`/contacts/${id}`)

  return {
    id: contact.id,
    display_name: contact.display_name,
    phones: [contact.mobile_phone, ...(contact.extra_phones || [])].filter(Boolean) as string[],
  }
}
