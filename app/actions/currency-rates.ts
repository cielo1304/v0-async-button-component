'use server'

import { createSupabaseAndRequireUser } from '@/lib/supabase/require-user'
import { revalidatePath } from 'next/cache'

// Базовые валюты системы
const SUPPORTED_CURRENCIES = ['USD', 'RUB', 'EUR', 'USDT'] as const
type Currency = typeof SUPPORTED_CURRENCIES[number]

// Exchange Rate API (бесплатный endpoint)
const EXCHANGE_RATE_API_URL = 'https://open.er-api.com/v6/latest'

interface ExchangeRateResponse {
  result: string
  base_code: string
  rates: Record<string, number>
  time_last_update_utc: string
}

interface RateResult {
  success: boolean
  rates?: Record<string, Record<string, number>>
  error?: string
  source?: string
  updated_at?: string
}

// Получение курсов с Exchange Rate API
async function fetchExternalRates(): Promise<RateResult> {
  try {
    // Получаем курсы для USD как базы
    const response = await fetch(`${EXCHANGE_RATE_API_URL}/USD`, {
      next: { revalidate: 3600 } // Кэшируем на 1 час
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const data: ExchangeRateResponse = await response.json()

    if (data.result !== 'success') {
      throw new Error('API returned error result')
    }

    // Строим матрицу курсов для всех поддерживаемых валют
    const rates: Record<string, Record<string, number>> = {}

    // Курсы USD к другим валютам
    const usdToRub = data.rates['RUB'] || 92.5
    const usdToEur = data.rates['EUR'] || 0.92

    // USDT считаем 1:1 с USD
    const usdToUsdt = 1.0

    // Заполняем матрицу курсов
    for (const from of SUPPORTED_CURRENCIES) {
      rates[from] = {}
      for (const to of SUPPORTED_CURRENCIES) {
        if (from === to) {
          rates[from][to] = 1
          continue
        }

        // Конвертация через USD
        let fromToUsd: number
        let usdToTarget: number

        // From currency to USD
        switch (from) {
          case 'USD': fromToUsd = 1; break
          case 'USDT': fromToUsd = 1; break
          case 'RUB': fromToUsd = 1 / usdToRub; break
          case 'EUR': fromToUsd = 1 / usdToEur; break
          default: fromToUsd = 1
        }

        // USD to target currency
        switch (to) {
          case 'USD': usdToTarget = 1; break
          case 'USDT': usdToTarget = 1; break
          case 'RUB': usdToTarget = usdToRub; break
          case 'EUR': usdToTarget = usdToEur; break
          default: usdToTarget = 1
        }

        rates[from][to] = Math.round(fromToUsd * usdToTarget * 10000) / 10000
      }
    }

    return {
      success: true,
      rates,
      source: 'exchangerate-api.com',
      updated_at: data.time_last_update_utc
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch rates'
    }
  }
}

// Сохранение курсов в БД
async function saveRatesToDb(rates: Record<string, Record<string, number>>, source: string) {
  const { supabase } = await createSupabaseAndRequireUser()
  
  const ratesToInsert = []
  
  for (const from of Object.keys(rates)) {
    for (const to of Object.keys(rates[from])) {
      if (from !== to) {
        ratesToInsert.push({
          from_currency: from,
          to_currency: to,
          rate: rates[from][to],
          source
        })
      }
    }
  }

  // Удаляем старые курсы и вставляем новые
  const { error: deleteError } = await supabase
    .from('currency_rates')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

  if (deleteError) {
    // Silent fail for delete
  }

  const { error: insertError } = await supabase
    .from('currency_rates')
    .insert(ratesToInsert)

  if (insertError) {
    return false
  }

  return true
}

// Публичная функция для обновления курсов
export async function refreshCurrencyRates(): Promise<RateResult> {
  const result = await fetchExternalRates()
  
  if (result.success && result.rates) {
    const saved = await saveRatesToDb(result.rates, result.source || 'api')
    if (!saved) {
      return {
        success: false,
        error: 'Failed to save rates to database'
      }
    }
    revalidatePath('/finance')
  }
  
  return result
}

// Получение текущего курса между двумя валютами
export async function getExchangeRate(from: string, to: string): Promise<{ rate: number; source: string }> {
  if (from === to) {
    return { rate: 1, source: 'system' }
  }

  const { supabase } = await createSupabaseAndRequireUser()

  // Сначала пробуем из БД
  const { data: dbRate } = await supabase
    .from('currency_rates')
    .select('rate, source')
    .eq('from_currency', from)
    .eq('to_currency', to)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (dbRate) {
    return { rate: Number(dbRate.rate), source: dbRate.source }
  }

  // Если нет в БД - получаем из API и сохраняем
  const apiResult = await fetchExternalRates()
  
  if (apiResult.success && apiResult.rates && apiResult.rates[from] && apiResult.rates[from][to]) {
    await saveRatesToDb(apiResult.rates, apiResult.source || 'api')
    return { rate: apiResult.rates[from][to], source: 'api' }
  }

  // Fallback курсы
  const fallbackRates: Record<string, Record<string, number>> = {
    USD: { RUB: 92.5, EUR: 0.92, USDT: 1 },
    RUB: { USD: 0.0108, EUR: 0.01, USDT: 0.0108 },
    EUR: { USD: 1.087, RUB: 100.25, USDT: 1.087 },
    USDT: { USD: 1, RUB: 92.5, EUR: 0.92 }
  }

  const rate = fallbackRates[from]?.[to] || 1
  return { rate, source: 'fallback' }
}

// Получение всех текущих курсов
export async function getAllRates(): Promise<Record<string, Record<string, number>>> {
  const { supabase } = await createSupabaseAndRequireUser()
  
  const { data } = await supabase
    .from('currency_rates')
    .select('from_currency, to_currency, rate')
    .order('created_at', { ascending: false })

  const rates: Record<string, Record<string, number>> = {}

  if (data) {
    for (const row of data) {
      if (!rates[row.from_currency]) {
        rates[row.from_currency] = {}
      }
      // Берем только первую (самую новую) запись для каждой пары
      if (!rates[row.from_currency][row.to_currency]) {
        rates[row.from_currency][row.to_currency] = Number(row.rate)
      }
    }
  }

  // Добавляем курсы 1:1 для одинаковых валют
  for (const currency of SUPPORTED_CURRENCIES) {
    if (!rates[currency]) rates[currency] = {}
    rates[currency][currency] = 1
  }

  return rates
}

// ========== COMPANY_CURRENCY_RATES (per-company rates) ==========

// Helper: get the active company_id for the current user
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getActiveCompanyId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('team_members')
    .select('company_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  return data?.company_id ?? null
}

export async function getSystemCurrencyRates() {
  const { supabase, user } = await createSupabaseAndRequireUser()

  // Try per-company rates first (059 table)
  const companyId = await getActiveCompanyId(supabase, user.id)
  if (companyId) {
    const { data: companyRates } = await supabase
      .from('company_currency_rates')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order')
    if (companyRates && companyRates.length > 0) {
      return companyRates
    }
    // Ensure company rates are seeded, then retry
    await supabase.rpc('ensure_company_currency_rates', { p_company_id: companyId }).catch(() => {})
    const { data: seeded } = await supabase
      .from('company_currency_rates')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order')
    if (seeded && seeded.length > 0) return seeded
  }

  // Fallback: global system_currency_rates
  const { data } = await supabase
    .from('system_currency_rates')
    .select('*')
    .order('sort_order')
  return data || []
}

export async function updateSystemRate(code: string, rate_to_rub: number, rate_to_usd: number) {
  const { supabase, user } = await createSupabaseAndRequireUser()

  const companyId = await getActiveCompanyId(supabase, user.id)

  if (companyId) {
    // Update company-specific rate
    const { data: prev } = await supabase
      .from('company_currency_rates')
      .select('rate_to_rub')
      .eq('company_id', companyId)
      .eq('code', code)
      .maybeSingle()

    const { error } = await supabase
      .from('company_currency_rates')
      .upsert({
        company_id: companyId,
        code,
        rate_to_rub,
        rate_to_usd,
        prev_rate_to_rub: prev?.rate_to_rub || rate_to_rub,
        change_24h: prev?.rate_to_rub ? ((rate_to_rub - prev.rate_to_rub) / prev.rate_to_rub) * 100 : 0,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'company_id,code' })

    if (error) throw error

    // Write to currency_rate_history with company_id
    try {
      await supabase
        .from('currency_rate_history')
        .insert({ code, rate_to_rub, company_id: companyId })
    } catch (historyErr) {
      console.error('[v0] Failed to write currency_rate_history:', historyErr)
    }
  } else {
    // Fallback: update global system_currency_rates (no company membership)
    const { data: prev } = await supabase
      .from('system_currency_rates')
      .select('rate_to_rub')
      .eq('code', code)
      .maybeSingle()

    const { error } = await supabase
      .from('system_currency_rates')
      .update({
        rate_to_rub,
        rate_to_usd,
        prev_rate_to_rub: prev?.rate_to_rub || rate_to_rub,
        change_24h: prev?.rate_to_rub ? ((rate_to_rub - prev.rate_to_rub) / prev.rate_to_rub) * 100 : 0,
        last_updated: new Date().toISOString(),
      })
      .eq('code', code)

    if (error) throw error

    try {
      await supabase
        .from('currency_rate_history')
        .insert({ code, rate_to_rub })
    } catch (historyErr) {
      console.error('[v0] Failed to write currency_rate_history:', historyErr)
    }
  }

  revalidatePath('/finance')
}

export async function refreshSystemRates() {
  const apiResult = await fetchExternalRates()

  if (!apiResult.success || !apiResult.rates) {
    return { success: false, error: apiResult.error }
  }

  // Обновляем курсы для USD, EUR, USDT (RUB = base)
  const updates = [
    { code: 'USD', rate_to_rub: apiResult.rates['USD']['RUB'], rate_to_usd: 1 },
    { code: 'EUR', rate_to_rub: apiResult.rates['EUR']['RUB'], rate_to_usd: apiResult.rates['EUR']['USD'] },
    { code: 'USDT', rate_to_rub: apiResult.rates['USD']['RUB'], rate_to_usd: 1 },
  ]

  for (const update of updates) {
    await updateSystemRate(update.code, update.rate_to_rub, update.rate_to_usd).catch(() => {})
  }

  const { supabase } = await createSupabaseAndRequireUser()

  // Also save to currency_rates for legacy compatibility (global rows, company_id = null)
  const ratesToInsert = []
  for (const from of Object.keys(apiResult.rates)) {
    for (const to of Object.keys(apiResult.rates[from])) {
      if (from !== to) {
        ratesToInsert.push({
          from_currency: from,
          to_currency: to,
          rate: apiResult.rates[from][to],
          source: 'auto_refresh',
          company_id: null,
        })
      }
    }
  }

  if (ratesToInsert.length > 0) {
    await supabase
      .from('currency_rates')
      .insert(ratesToInsert)
      .catch(() => {}) // Non-blocking
  }

  revalidatePath('/finance')
  return { success: true }
}

// STEP 6: Get historical rate for a specific date
export async function getRateAtDate(
  currencyCode: string,
  targetDate: string | Date
): Promise<{ rate_to_rub: number; rate_to_usd: number; recorded_at: string } | null> {
  const { supabase } = await createSupabaseAndRequireUser()
  
  const dateStr = typeof targetDate === 'string' ? targetDate : targetDate.toISOString()
  
  // Find the closest rate on or before the target date
  const { data } = await supabase
    .from('currency_rate_history')
    .select('rate_to_rub, rate_to_usd, recorded_at')
    .eq('currency_code', currencyCode)
    .lte('recorded_at', dateStr)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single()
  
  if (data) {
    return {
      rate_to_rub: Number(data.rate_to_rub),
      rate_to_usd: Number(data.rate_to_usd),
      recorded_at: data.recorded_at,
    }
  }
  
  // Fallback: get current rate from system_currency_rates
  const { data: current } = await supabase
    .from('system_currency_rates')
    .select('rate_to_rub, rate_to_usd')
    .eq('code', currencyCode)
    .single()
  
  if (current) {
    return {
      rate_to_rub: Number(current.rate_to_rub),
      rate_to_usd: Number(current.rate_to_usd),
      recorded_at: new Date().toISOString(),
    }
  }
  
  return null
}
