'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'

export type DepositWithdrawInput = {
  cashboxId: string
  amount: number
  type: 'DEPOSIT' | 'WITHDRAW'
  description?: string
  actorEmployeeId?: string
}

export async function depositWithdraw(input: DepositWithdrawInput) {
  const supabase = await createServerClient()

  try {
    // 1. Получаем кассу для проверок
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

    const transactionAmount = input.type === 'DEPOSIT' ? input.amount : -input.amount

    // 3. Атомарно: обновляем баланс + создаем транзакцию через RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc('cashbox_operation', {
      p_cashbox_id: input.cashboxId,
      p_amount: transactionAmount,
      p_category: input.type,
      p_description: input.description || (input.type === 'DEPOSIT' ? 'Внесение средств' : 'Изъятие средств'),
      p_created_by: input.actorEmployeeId || '00000000-0000-0000-0000-000000000000',
    })

    if (rpcError) {
      return { success: false, error: `Ошибка операции: ${rpcError.message}` }
    }

    revalidatePath('/finance')
    return { success: true, message: `${input.type === 'DEPOSIT' ? 'Внесено' : 'Выведено'} ${input.amount} ${cashbox.currency}` }

  } catch {
    return { success: false, error: 'Неизвестная ошибка' }
  }
}
