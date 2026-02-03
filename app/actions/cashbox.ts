'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'

export type DepositWithdrawInput = {
  cashboxId: string
  amount: number
  type: 'DEPOSIT' | 'WITHDRAW'
  description?: string
}

export async function depositWithdraw(input: DepositWithdrawInput) {
  const supabase = await createServerClient()

  try {
    // 1. Получаем кассу
    const { data: cashbox, error: fetchError } = await supabase
      .from('cashboxes')
      .select('*')
      .eq('id', input.cashboxId)
      .single()

    if (fetchError || !cashbox) {
      return { success: false, error: 'Касса не найдена' }
    }

    if (cashbox.is_archived) {
      return { success: false, error: 'Касса архивирована' }
    }

    // 2. Проверяем баланс для вывода
    if (input.type === 'WITHDRAW' && Number(cashbox.balance) < input.amount) {
      return { success: false, error: `Недостаточно средств. Доступно: ${cashbox.balance} ${cashbox.currency}` }
    }

    // 3. Вычисляем новый баланс
    const newBalance = input.type === 'DEPOSIT'
      ? Number(cashbox.balance) + input.amount
      : Number(cashbox.balance) - input.amount

    const transactionAmount = input.type === 'DEPOSIT' ? input.amount : -input.amount

    // 4. Обновляем баланс кассы
    const { error: updateError } = await supabase
      .from('cashboxes')
      .update({ balance: newBalance })
      .eq('id', input.cashboxId)

    if (updateError) {
      return { success: false, error: 'Ошибка обновления баланса' }
    }

    // 5. Создаем транзакцию
    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        cashbox_id: input.cashboxId,
        amount: transactionAmount,
        balance_after: newBalance,
        category: input.type,
        description: input.description || (input.type === 'DEPOSIT' ? 'Внесение средств' : 'Изъятие средств'),
        created_by: '00000000-0000-0000-0000-000000000000', // TODO: заменить на реального пользователя
      })

    if (txError) {
      // Откатываем баланс
      await supabase
        .from('cashboxes')
        .update({ balance: cashbox.balance })
        .eq('id', input.cashboxId)
      return { success: false, error: 'Ошибка создания транзакции' }
    }

    revalidatePath('/finance')
    return { success: true, message: `${input.type === 'DEPOSIT' ? 'Внесено' : 'Выведено'} ${input.amount} ${cashbox.currency}` }

  } catch {
    return { success: false, error: 'Неизвестная ошибка' }
  }
}
