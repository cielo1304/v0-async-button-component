'use client'

import React from "react"

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Cashbox, Transaction } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { 
  ArrowLeft, 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  ArrowRightLeft,
  Wallet,
  DollarSign,
  CreditCard,
  Landmark,
  Bitcoin
} from 'lucide-react'
import { CashboxOperationDialog } from '@/components/finance/cashbox-operation-dialog'
import { TransferDialog } from '@/components/finance/transfer-dialog'
import { TransactionDetailDialog } from '@/components/finance/transaction-detail-dialog'

const CASHBOX_TYPE_LABELS: Record<string, string> = {
  CASH: 'Наличные',
  BANK: 'Банк',
  CRYPTO: 'Крипто',
  TRADE_IN: 'Trade-In',
}

const CASHBOX_TYPE_ICONS: Record<string, React.ReactNode> = {
  CASH: <Wallet className="h-5 w-5" />,
  BANK: <Landmark className="h-5 w-5" />,
  CRYPTO: <Bitcoin className="h-5 w-5" />,
  TRADE_IN: <CreditCard className="h-5 w-5" />,
}

const CATEGORY_LABELS: Record<string, string> = {
  DEPOSIT: 'Внесение',
  WITHDRAW: 'Вывод',
  DEAL_PAYMENT: 'Оплата сделки',
  EXPENSE: 'Расход',
  SALARY: 'Зарплата',
  EXCHANGE_OUT: 'Обмен (отправлено)',
  EXCHANGE_IN: 'Обмен (получено)',
  TRANSFER_OUT: 'Перевод (отправлено)',
  TRANSFER_IN: 'Перевод (получено)',
}

const CATEGORY_COLORS: Record<string, string> = {
  DEPOSIT: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  WITHDRAW: 'bg-red-500/10 text-red-400 border-red-500/20',
  DEAL_PAYMENT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  EXPENSE: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  SALARY: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  EXCHANGE_OUT: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  EXCHANGE_IN: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  TRANSFER_OUT: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  TRANSFER_IN: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
}

export default function CashboxDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [cashbox, setCashbox] = useState<Cashbox | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [showTransactionDetail, setShowTransactionDetail] = useState(false)
  const supabase = createClient()

  const loadData = async () => {
    try {
      const [cashboxRes, transactionsRes] = await Promise.all([
        supabase
          .from('cashboxes')
          .select('*')
          .eq('id', params.id)
          .single(),
        supabase
          .from('transactions')
          .select('*')
          .eq('cashbox_id', params.id)
          .order('created_at', { ascending: false })
          .limit(50)
      ])

      if (cashboxRes.error) throw cashboxRes.error
      setCashbox(cashboxRes.data)
      setTransactions(transactionsRes.data || [])
    } catch {
      router.push('/finance')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [params.id])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!cashbox) {
    return null
  }

  const formatMoney = (amount: number) => {
    return Number(amount).toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const totalIn = transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const totalOut = transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/finance">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Назад
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  {CASHBOX_TYPE_ICONS[cashbox.type] || <DollarSign className="h-5 w-5" />}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">{cashbox.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {CASHBOX_TYPE_LABELS[cashbox.type]} - {cashbox.currency}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CashboxOperationDialog 
                cashbox={cashbox} 
                type="DEPOSIT" 
                onSuccess={loadData} 
              />
              <CashboxOperationDialog 
                cashbox={cashbox} 
                type="WITHDRAW" 
                onSuccess={loadData} 
              />
              <TransferDialog 
                fromCashbox={cashbox} 
                onSuccess={loadData} 
              />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">Текущий баланс</div>
              <div className="text-2xl font-bold font-mono text-foreground">
                {formatMoney(cashbox.balance)} {cashbox.currency}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">Начальный баланс</div>
              <div className="text-2xl font-bold font-mono text-muted-foreground">
                {formatMoney(cashbox.initial_balance)} {cashbox.currency}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Поступления
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                +{formatMoney(totalIn)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingDown className="h-4 w-4 text-red-400" />
                Расходы
              </div>
              <div className="text-2xl font-bold font-mono text-red-400">
                -{formatMoney(totalOut)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">История операций</CardTitle>
            <CardDescription>Последние 50 транзакций</CardDescription>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Транзакций пока нет
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div 
                    key={tx.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedTransaction(tx)
                      setShowTransactionDetail(true)
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${tx.amount > 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                        {tx.amount > 0 ? (
                          <TrendingUp className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-400" />
                        )}
                      </div>
                      <div>
                        <Badge variant="outline" className={CATEGORY_COLORS[tx.category] || ''}>
                          {CATEGORY_LABELS[tx.category] || tx.category}
                        </Badge>
                        {tx.description && (
                          <div className="text-sm text-muted-foreground mt-1">
                            {tx.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono font-semibold ${tx.amount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {tx.amount > 0 ? '+' : ''}{formatMoney(tx.amount)} {cashbox.currency}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Баланс: {formatMoney(tx.balance_after)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString('ru-RU')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Диалог деталей транзакции */}
      {selectedTransaction && cashbox && (
        <TransactionDetailDialog
          transaction={selectedTransaction}
          cashbox={cashbox}
          open={showTransactionDetail}
          onOpenChange={setShowTransactionDetail}
        />
      )}
    </div>
  )
}
