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

    // 6. Обновляем баланс источника
    const { error: updateFromError } = await supabase
      .from('cashboxes')
      .update({ balance: newFromBalance })
      .eq('id', data.fromBoxId)

    if (updateFromError) {
      return { success: false, error: 'Ошибка обновления баланса источника' }
    }

    // 7. Обновляем баланс назначения
    const { error: updateToError } = await supabase
      .from('cashboxes')
      .update({ balance: newToBalance })
      .eq('id', data.toBoxId)

    if (updateToError) {
      // Откатываем изменение баланса источника
      await supabase
        .from('cashboxes')
        .update({ balance: fromBox.balance })
        .eq('id', data.fromBoxId)
      return { success: false, error: 'Ошибка обновления баланса назначения' }
    }

    // 8. Создаем транзакцию списания
    const { data: txOut, error: txOutError } = await supabase
      .from('transactions')
      .insert({
        cashbox_id: data.fromBoxId,
        amount: -data.sentAmount,
        balance_after: newFromBalance,
        category: 'EXCHANGE_OUT',
        description: data.description || `Обмен на ${data.receivedAmount.toFixed(2)} ${toBox.currency}`,
        created_by: '00000000-0000-0000-0000-000000000000', // System user для MVP
      })
      .select()
      .single()

    if (txOutError) {
      console.error('TX OUT error:', txOutError)
    }

    // 9. Создаем транзакцию зачисления
    const { error: txInError } = await supabase
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

    if (txInError) {
      console.error('TX IN error:', txInError)
    }

    // 10. Запись в журнал обменов
    const { error: exchangeLogError } = await supabase
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

    if (exchangeLogError) {
      console.error('Exchange log error:', exchangeLogError)
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
