import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SalaryBalanceList } from '@/components/hr/salary-balance-list'
import { AddBonusDialog } from '@/components/hr/add-bonus-dialog'
import { AddEmployeeDialog } from '@/components/hr/add-employee-dialog'

export default function HRPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">{'← Назад'}</Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-violet-500/10">
                  <Users className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">HR и Зарплаты</h1>
                  <p className="text-sm text-muted-foreground">{'Управление сотрудниками и начислениями'}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AddEmployeeDialog />
              <AddBonusDialog />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Балансы сотрудников</CardTitle>
            <CardDescription>{'Начисления, выплаты и текущие долги'}</CardDescription>
          </CardHeader>
          <CardContent>
            <SalaryBalanceList />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
