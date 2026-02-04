'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const ExchangeSchema = z.object({
  fromBoxId: z.string().uuid(),
  toBoxId: z.string().uuid(),
  sentAmount: z.number().positive().max(1000000000),
  receivedAmount: z.number().positive(),
  rate: z.number().positive(),
  fee: z.number().min(0).default(0),
  description: z.string().optional(),
})

export type ExchangeInput = z.infer<typeof ExchangeSchema>

export async function executeExchange(input: ExchangeInput) {
  const supabase = await createServerClient()
  
  try {
    // 1. Валидация
    const data = ExchangeSchema.parse(input)

    // 2. Получение данных касс
    const { data: fromBox, error: fromError } = await supabase
      .from('cashboxes')
      .select('*')
      .eq('id', data.fromBoxId)
      .single()

    const { data: toBox, error: toError } = await supabase
      .from('cashboxes')
      .select('*')
      .eq('id', data.toBoxId)
      .single()

    if (fromError || toError || !fromBox || !toBox) {
      return { success: false, error: 'Касса не найдена' }
    }

    if (fromBox.is_archived || toBox.is_archived) {
      return { success: false, error: 'Касса архивирована' }
    }

    if (fromBox.currency === toBox.currency) {
      return { success: false, error: 'Нельзя обменивать одинаковую валюту' }
    }

    // 3. Проверка баланса
    if (Number(fromBox.balance) < data.sentAmount) {
      return { 
        success: false, 
        error: `Недостаточно средств. Доступно: ${fromBox.balance} ${fromBox.currency}` 
      }
    }

    // 4. Проверка курса (допустимое отклонение 5%)
    const calculatedRate = data.receivedAmount / data.sentAmount
    const rateDeviation = Math.abs((calculatedRate - data.rate) / data.rate)
    if (rateDeviation > 0.05) {
      return { success: false, error: 'Отклонение курса слишком велико. Обновите страницу.' }
    }

    // 5. Вычисляем новые балансы
    const newFromBalance = Number(fromBox.balance) - data.sentAmount
    const newToBalance = Number(toBox.balance) + data.receivedAmount

    // 6-10. Выполняем все операции атомарно через последовательные запросы с откатом при ошибке
    // Примечание: Supabase не поддерживает транзакции напрямую через JS SDK,
    // поэтому реализуем паттерн "компенсирующих транзакций"
    
    const rollbackOperations: Array<() => Promise<void>> = []
    
    try {
      // 6. Обновляем баланс источника
      const { error: updateFromError } = await supabase
        .from('cashboxes')
        .update({ balance: newFromBalance })
        .eq('id', data.fromBoxId)

      if (updateFromError) {
        throw new Error('Ошибка обновления баланса источника')
      }
      
      // Добавляем откат для этой операции
      rollbackOperations.push(async () => {
        await supabase.from('cashboxes').update({ balance: fromBox.balance }).eq('id', data.fromBoxId)
      })

      // 7. Обновляем баланс назначения
      const { error: updateToError } = await supabase
        .from('cashboxes')
        .update({ balance: newToBalance })
        .eq('id', data.toBoxId)

      if (updateToError) {
        throw new Error('Ошибка обновления баланса назначения')
      }
      
      rollbackOperations.push(async () => {
        await supabase.from('cashboxes').update({ balance: toBox.balance }).eq('id', data.toBoxId)
      })

      // 8. Создаем транзакцию списания
      const { data: txOut, error: txOutError } = await supabase
        .from('transactions')
        .insert({
          cashbox_id: data.fromBoxId,
          amount: -data.sentAmount,
          balance_after: newFromBalance,
          category: 'EXCHANGE_OUT',
          description: data.description || `Обмен на ${data.receivedAmount.toFixed(2)} ${toBox.currency}`,
          created_by: '00000000-0000-0000-0000-000000000000',
        })
        .select()
        .single()

      if (txOutError) {
        throw new Error('Ошибка создания транзакции списания')
      }
      
      rollbackOperations.push(async () => {
        if (txOut?.id) {
          await supabase.from('transactions').delete().eq('id', txOut.id)
        }
      })

      // 9. Создаем транзакцию зачисления
      const { data: txIn, error: txInError } = await supabase
        .from('transactions')
        .insert({
          cashbox_id: data.toBoxId,
          amount: data.receivedAmount,
          balance_after: newToBalance,
          category: 'EXCHANGE_IN',
          description: data.description || `Обмен из ${data.sentAmount.toFixed(2)} ${fromBox.currency}`,
          reference_id: txOut?.id,
          created_by: '00000000-0000-0000-0000-000000000000',
        })
        .select()
        .single()

      if (txInError) {
        throw new Error('Ошибка создания транзакции зачисления')
      }
      
      rollbackOperations.push(async () => {
        if (txIn?.id) {
          await supabase.from('transactions').delete().eq('id', txIn.id)
        }
      })

      // 10. Запись в журнал обменов
      const { data: exchangeLog, error: exchangeLogError } = await supabase
        .from('exchange_logs')
        .insert({
          from_box_id: data.fromBoxId,
          to_box_id: data.toBoxId,
          sent_amount: data.sentAmount,
          sent_currency: fromBox.currency,
          received_amount: data.receivedAmount,
          received_currency: toBox.currency,
          rate: data.rate,
          fee_amount: data.fee,
          fee_currency: data.fee > 0 ? fromBox.currency : null,
          created_by: '00000000-0000-0000-0000-000000000000',
        })
        .select()
        .single()

      if (exchangeLogError) {
        throw new Error('Ошибка записи в журнал обменов')
      }
      
      rollbackOperations.push(async () => {
        if (exchangeLog?.id) {
          await supabase.from('exchange_logs').delete().eq('id', exchangeLog.id)
        }
      })
      
    } catch (operationError) {
      // Выполняем откат всех успешных операций в обратном порядке
      console.error('Exchange operation failed, rolling back:', operationError)
      for (let i = rollbackOperations.length - 1; i >= 0; i--) {
        try {
          await rollbackOperations[i]()
        } catch (rollbackError) {
          console.error('Rollback failed:', rollbackError)
        }
      }
      return { 
        success: false, 
        error: operationError instanceof Error ? operationError.message : 'Ошибка выполнения обмена' 
      }
    }

    // 11. Ревалидация
    revalidatePath('/finance')
    revalidatePath('/')

    return {
      success: true,
      message: `Обмен выполнен: ${data.sentAmount} ${fromBox.currency} → ${data.receivedAmount} ${toBox.currency}`,
    }

  } catch (error) {
    console.error('Exchange error:', error)
    
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Ошибка валидации', details: error.errors }
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка',
    }
  }
}

// Получить последние курсы валют
export async function getCurrencyRates() {
  const supabase = await createServerClient()
  
  const { data, error } = await supabase
    .from('currency_rates')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching rates:', error)
    return []
  }

  return data
}

// Получить курс валюты из внешнего API (Server Action для обхода CORS)
export async function fetchExternalRate(fromCurrency: string, toCurrency: string, sourceType?: string, apiUrl?: string, apiPath?: string): Promise<{ rate: number | null; error: string | null }> {
  try {
    // Если валюты одинаковые - курс 1
    if (fromCurrency === toCurrency) {
      return { rate: 1, error: null }
    }
    
    // USDT и USD считаем равными для простоты
    if ((fromCurrency === 'USDT' && toCurrency === 'USD') || (fromCurrency === 'USD' && toCurrency === 'USDT')) {
      return { rate: 1, error: null }
    }
    
    // Кастомный API источник
    if (sourceType === 'api' && apiUrl) {
      try {
        const url = apiUrl
          .replace('{from}', fromCurrency)
          .replace('{to}', toCurrency)
        const response = await fetch(url, { next: { revalidate: 60 } })
        if (response.ok) {
          const data = await response.json()
          if (apiPath) {
            const path = apiPath.replace('{to}', toCurrency)
            const value = path.split('.').reduce((obj: Record<string, unknown>, key: string) => obj?.[key] as Record<string, unknown>, data as Record<string, unknown>)
            if (typeof value === 'number') {
              return { rate: value, error: null }
            }
          }
          return { rate: data.rate || data.price || data.result || null, error: null }
        }
      } catch {
        // Продолжаем к дефолтному API
      }
    }
    
    // Для криптовалют используем CoinGecko (бесплатный, без региональных ограничений)
    const cryptoCurrencies = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'XRP', 'SOL', 'ADA']
    const cryptoIds: Record<string, string> = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'USDT': 'tether',
      'USDC': 'usd-coin',
      'BNB': 'binancecoin',
      'XRP': 'ripple',
      'SOL': 'solana',
      'ADA': 'cardano'
    }
    
    if (cryptoCurrencies.includes(fromCurrency)) {
      const cryptoId = cryptoIds[fromCurrency]
      if (cryptoId) {
        try {
          // CoinGecko возвращает курс к USD
          const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=usd`,
            { next: { revalidate: 60 } }
          )
          if (response.ok) {
            const data = await response.json()
            const priceInUSD = data[cryptoId]?.usd
            if (priceInUSD) {
              // Если целевая валюта USD или USDT - возвращаем напрямую
              if (toCurrency === 'USD' || toCurrency === 'USDT') {
                return { rate: priceInUSD, error: null }
              }
              // Иначе нужно конвертировать USD в целевую валюту
              const usdToTargetResponse = await fetch(
                `https://api.exchangerate-api.com/v4/latest/USD`,
                { next: { revalidate: 300 } }
              )
              if (usdToTargetResponse.ok) {
                const usdData = await usdToTargetResponse.json()
                if (usdData.rates?.[toCurrency]) {
                  return { rate: priceInUSD * usdData.rates[toCurrency], error: null }
                }
              }
            }
          }
        } catch {
          // Продолжаем к стандартному API
        }
      }
    }
    
    // Дефолтный Exchange Rate API для фиатных валют
    try {
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`, {
        next: { revalidate: 300 }
      })
      if (response.ok) {
        const data = await response.json()
        if (data.rates && data.rates[toCurrency]) {
          return { rate: data.rates[toCurrency], error: null }
        }
      }
    } catch {
      // Продолжаем
    }
    
    return { rate: null, error: 'Курс не найден для этой пары валют' }
  } catch (error) {
    console.error('Error fetching external rate:', error)
    return { rate: null, error: 'Ошибка загрузки курса' }
  }
}
