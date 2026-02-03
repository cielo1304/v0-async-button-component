'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { CarExpense, Cashbox, StockItem, Transaction } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { 
  Wrench, 
  Loader2, 
  Calendar, 
  Wallet, 
  Package,
  FileText,
  Hash,
  Car
} from 'lucide-react'
import Link from 'next/link'

interface ExpenseDetailDialogProps {
  expense: CarExpense
  carName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  'REPAIR': 'Ремонт',
  'PARTS': 'Запчасти',
  'DETAILING': 'Детейлинг',
  'LOGISTICS': 'Логистика',
  'DOCS': 'Документы',
  'OTHER': 'Прочее',
}

const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  'REPAIR': 'bg-red-500/10 text-red-400',
  'PARTS': 'bg-blue-500/10 text-blue-400',
  'DETAILING': 'bg-purple-500/10 text-purple-400',
  'LOGISTICS': 'bg-amber-500/10 text-amber-400',
  'DOCS': 'bg-green-500/10 text-green-400',
  'OTHER': 'bg-zinc-500/10 text-zinc-400',
}

export function ExpenseDetailDialog({ expense, carName, open, onOpenChange }: ExpenseDetailDialogProps) {
  const [cashbox, setCashbox] = useState<Cashbox | null>(null)
  const [stockItem, setStockItem] = useState<StockItem | null>(null)
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  const loadRelatedData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Загружаем кассу если есть
      if (expense.cashbox_id) {
        const { data: cashboxData } = await supabase
          .from('cashboxes')
          .select('*')
          .eq('id', expense.cashbox_id)
          .single()
        
        if (cashboxData) setCashbox(cashboxData)
      }

      // Ищем связанную транзакцию
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .eq('reference_id', expense.id)
        .eq('category', 'EXPENSE')
        .single()
      
      if (txData) setTransaction(txData)

      // Ищем связанный товар со склада (если расход был со склада)
      // Это можно определить по описанию или по reference в stock_movements
      const { data: movementData } = await supabase
        .from('stock_movements')
        .select('*, stock_items(*)')
        .eq('reference_id', expense.car_id)
        .eq('reference_type', 'car_expense')
        .single()

      if (movementData?.stock_items) {
        setStockItem(movementData.stock_items as StockItem)
      }

    } catch (error) {
      // Игнорируем ошибки - связанные данные опциональны
    } finally {
      setIsLoading(false)
    }
  }, [expense, supabase])

  useEffect(() => {
    if (open) {
      loadRelatedData()
    }
  }, [open, loadRelatedData])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${EXPENSE_CATEGORY_COLORS[expense.category] || 'bg-zinc-500/10'}`}>
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-foreground">
                {EXPENSE_CATEGORY_LABELS[expense.category] || expense.category}
              </DialogTitle>
              <DialogDescription>Детали расхода на автомобиль</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 pt-4">
            {/* Основная информация */}
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center gap-3">
                  <Wallet className="h-5 w-5 text-amber-400" />
                  <div>
                    <div className="text-sm text-muted-foreground">Сумма расхода</div>
                    <div className="text-2xl font-bold font-mono text-amber-400">
                      -{Number(expense.amount).toLocaleString('ru-RU')}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className="font-mono">
                  {expense.currency}
                </Badge>
              </div>

              {/* Автомобиль */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                <Car className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm text-muted-foreground">Автомобиль</div>
                  <div className="font-medium text-foreground">{carName}</div>
                </div>
              </div>

              {/* Категория */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                <Wrench className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm text-muted-foreground">Категория</div>
                  <Badge className={EXPENSE_CATEGORY_COLORS[expense.category]}>
                    {EXPENSE_CATEGORY_LABELS[expense.category] || expense.category}
                  </Badge>
                </div>
              </div>

              {/* Дата расхода */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm text-muted-foreground">Дата расхода</div>
                  <div className="font-medium text-foreground">
                    {expense.expense_date 
                      ? new Date(expense.expense_date).toLocaleDateString('ru-RU')
                      : new Date(expense.created_at).toLocaleDateString('ru-RU')}
                  </div>
                </div>
              </div>

              {/* Описание */}
              {expense.description && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="text-sm text-muted-foreground">Описание</div>
                    <div className="font-medium text-foreground">{expense.description}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Связанная касса */}
            {cashbox && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Оплачено из кассы</div>
                <Link href={`/finance/${cashbox.id}`}>
                  <div className="p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Wallet className="h-4 w-4 text-emerald-400" />
                        <div>
                          <div className="font-medium text-foreground">{cashbox.name}</div>
                          <div className="text-sm text-muted-foreground">{cashbox.type}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="font-mono">
                        {cashbox.currency}
                      </Badge>
                    </div>
                  </div>
                </Link>
              </div>
            )}

            {/* Связанный товар со склада */}
            {stockItem && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Списано со склада</div>
                <Link href={`/stock/${stockItem.id}`}>
                  <div className="p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Package className="h-4 w-4 text-blue-400" />
                        <div>
                          <div className="font-medium text-foreground">{stockItem.name}</div>
                          <div className="text-sm text-muted-foreground">{stockItem.sku}</div>
                        </div>
                      </div>
                      <Badge variant="outline">{stockItem.category}</Badge>
                    </div>
                  </div>
                </Link>
              </div>
            )}

            {/* Связанная транзакция */}
            {transaction && cashbox && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Транзакция в журнале</div>
                <Link href={`/finance/${cashbox.id}`}>
                  <div className="p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-muted-foreground">Баланс после операции</div>
                        <div className="font-bold font-mono text-foreground">
                          {Number(transaction.balance_after).toLocaleString('ru-RU')} {cashbox.currency}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(transaction.created_at).toLocaleString('ru-RU')}
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            )}

            {/* ID */}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Hash className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-mono">{expense.id}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
