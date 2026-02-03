'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Car, Users, FileText, Store } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CarList } from '@/components/cars/car-list'
import { AddCarDialog } from '@/components/cars/add-car-dialog'
import { AddExpenseDialog } from '@/components/cars/add-expense-dialog'
import { AutoClientList } from '@/components/auto-platform/auto-client-list'
import { AddAutoClientDialog } from '@/components/auto-platform/add-auto-client-dialog'
import { AutoDealList } from '@/components/auto-platform/auto-deal-list'
import { AddAutoDealDialog } from '@/components/auto-platform/add-auto-deal-dialog'
import { RolesManager } from '@/components/auto-platform/roles-manager'
import { Settings } from 'lucide-react'

type Tab = 'cars' | 'clients' | 'deals' | 'settings'

export default function CarsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('cars')

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
                <div className="p-2 rounded-lg bg-zinc-800">
                  <Store className="h-5 w-5 text-zinc-100" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Автоплощадка</h1>
                  <p className="text-sm text-muted-foreground">{'Автомобили, клиенты и сделки площадки'}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === 'cars' && (
                <>
                  <AddExpenseDialog />
                  <AddCarDialog />
                </>
              )}
              {activeTab === 'clients' && <AddAutoClientDialog />}
              {activeTab === 'deals' && <AddAutoDealDialog />}
            </div>
          </div>
        </div>

        {/* Вкладки */}
        <div className="container mx-auto px-4">
          <div className="flex gap-1 -mb-px">
            <button
              onClick={() => setActiveTab('cars')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === 'cars'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Car className="h-4 w-4" />
              Автомобили
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === 'clients'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Users className="h-4 w-4" />
              Клиенты
            </button>
            <button
              onClick={() => setActiveTab('deals')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === 'deals'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <FileText className="h-4 w-4" />
              Сделки площадки
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Settings className="h-4 w-4" />
              Настройки
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {activeTab === 'cars' && (
          <Card>
            <CardHeader>
              <CardTitle>Список автомобилей</CardTitle>
              <CardDescription>{'Все ТС в системе с экономикой и статусами'}</CardDescription>
            </CardHeader>
            <CardContent>
              <CarList />
            </CardContent>
          </Card>
        )}

        {activeTab === 'clients' && (
          <Card>
            <CardHeader>
              <CardTitle>Клиенты автоплощадки</CardTitle>
              <CardDescription>{'Покупатели, продавцы, арендаторы и комитенты'}</CardDescription>
            </CardHeader>
            <CardContent>
              <AutoClientList />
            </CardContent>
          </Card>
        )}

        {activeTab === 'deals' && (
          <Card>
            <CardHeader>
              <CardTitle>Сделки автоплощадки</CardTitle>
              <CardDescription>{'Продажи, комиссии, рассрочки и аренда'}</CardDescription>
            </CardHeader>
            <CardContent>
              <AutoDealList />
            </CardContent>
          </Card>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Управление ролями</CardTitle>
                <CardDescription>{'Назначение ролей и прав доступа для сотрудников'}</CardDescription>
              </CardHeader>
              <CardContent>
                <RolesManager />
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
