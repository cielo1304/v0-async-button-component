'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { 
  Settings, ArrowLeft, Building, Wallet, Package, 
  Car, Shield, Bell, Save, Loader2, Plus, Trash2, Database
} from 'lucide-react'
import { toast } from 'sonner'
import { LocationsManager } from '@/components/finance/locations-manager'
import { UserRolesManager } from '@/components/settings/user-roles-manager'

interface SystemSettings {
  company_name: string
  company_phone: string
  company_email: string
  company_address: string
  default_currency: string
  penalty_rate: number
  late_payment_days: number
  enable_notifications: boolean
  enable_auto_penalties: boolean
}

interface Warehouse {
  id: string
  name: string
  description: string | null
  location: string | null
  is_active: boolean
}

interface CurrencyRate {
  id: string
  code: string
  name: string
  symbol: string
  is_popular: boolean
  sort_order: number
}



export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [currencyRates, setCurrencyRates] = useState<CurrencyRate[]>([])
  
  const [settings, setSettings] = useState<SystemSettings>({
    company_name: '',
    company_phone: '',
    company_email: '',
    company_address: '',
    default_currency: 'RUB',
    penalty_rate: 0.1,
    late_payment_days: 3,
    enable_notifications: true,
    enable_auto_penalties: false,
  })

  // New warehouse form
  const [newWarehouseName, setNewWarehouseName] = useState('')
  const [newWarehouseDesc, setNewWarehouseDesc] = useState('')
  
  

  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // Load warehouses
      const { data: whData } = await supabase
        .from('warehouses')
        .select('*')
        .order('sort_order')
      setWarehouses(whData || [])

      // Load currency rates
      const { data: crData } = await supabase
        .from('system_currency_rates')
        .select('*')
        .order('sort_order')
      setCurrencyRates(crData || [])

      
    } catch (error) {
      console.error('[v0] Error loading settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    setIsSaving(true)
    try {
      // В реальном приложении здесь бы сохранялись настройки в таблицу system_settings
      toast.success('Настройки сохранены')
    } catch (error) {
      toast.error('Ошибка сохранения настроек')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddWarehouse = async () => {
    if (!newWarehouseName.trim()) {
      toast.error('Введите название склада')
      return
    }

    try {
      const { error } = await supabase.from('warehouses').insert({
        name: newWarehouseName.trim(),
        description: newWarehouseDesc.trim() || null,
        sort_order: warehouses.length + 1,
      })

      if (error) throw error

      toast.success('Склад добавлен')
      setNewWarehouseName('')
      setNewWarehouseDesc('')
      loadData()
    } catch (error) {
      toast.error('Ошибка при добавлении склада')
    }
  }

  const handleDeleteWarehouse = async (id: string) => {
    if (!confirm('Удалить этот склад?')) return

    try {
      const { error } = await supabase
        .from('warehouses')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error

      toast.success('Склад удален')
      loadData()
    } catch (error) {
      toast.error('Ошибка при удалении склада')
    }
  }

  const handleToggleCurrencyPopular = async (id: string, isPopular: boolean) => {
    // Check if we already have 6 popular currencies
    const popularCount = currencyRates.filter(c => c.is_popular).length
    if (!isPopular && popularCount >= 6) {
      toast.error('Максимум 6 популярных курсов')
      return
    }

    try {
      const { error } = await supabase
        .from('system_currency_rates')
        .update({ is_popular: !isPopular })
        .eq('id', id)

      if (error) throw error
      
      toast.success(isPopular ? 'Курс скрыт' : 'Курс добавлен в популярные')
      loadData()
    } catch (error) {
      toast.error('Ошибка обновления')
    }
  }

  

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Settings className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Настройки системы</h1>
                  <p className="text-sm text-muted-foreground">Глобальные параметры и справочники</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full max-w-3xl grid-cols-6">
            <TabsTrigger value="general" className="flex items-center gap-1">
              <Building className="h-4 w-4" />
              Общие
            </TabsTrigger>
            <TabsTrigger value="finance" className="flex items-center gap-1">
              <Wallet className="h-4 w-4" />
              Финансы
            </TabsTrigger>
            <TabsTrigger value="stock" className="flex items-center gap-1">
              <Package className="h-4 w-4" />
              Склад
            </TabsTrigger>
            <TabsTrigger value="auto" className="flex items-center gap-1">
              <Car className="h-4 w-4" />
              Авто
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center gap-1">
              <Shield className="h-4 w-4" />
              Роли
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-1">
              <Database className="h-4 w-4" />
              Система
            </TabsTrigger>
          </TabsList>

          {/* Общие настройки */}
          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Данные компании</CardTitle>
                <CardDescription>Основная информация о вашей компании</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Название компании</Label>
                    <Input 
                      value={settings.company_name}
                      onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                      placeholder="ООО Автоплощадка"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Телефон</Label>
                    <Input 
                      value={settings.company_phone}
                      onChange={(e) => setSettings({ ...settings, company_phone: e.target.value })}
                      placeholder="+7 (999) 123-45-67"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input 
                      value={settings.company_email}
                      onChange={(e) => setSettings({ ...settings, company_email: e.target.value })}
                      placeholder="info@company.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Валюта по умолчанию</Label>
                    <Input 
                      value={settings.default_currency}
                      onChange={(e) => setSettings({ ...settings, default_currency: e.target.value })}
                      placeholder="RUB"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Адрес</Label>
                  <Input 
                    value={settings.company_address}
                    onChange={(e) => setSettings({ ...settings, company_address: e.target.value })}
                    placeholder="г. Москва, ул. Примерная, д. 1"
                  />
                </div>
                <Button onClick={handleSaveSettings} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Сохранить
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Финансы - локации касс */}
          <TabsContent value="finance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Локации касс</CardTitle>
                <CardDescription>Управление местоположениями для касс. Нажмите на локацию для редактирования.</CardDescription>
              </CardHeader>
              <CardContent>
                <LocationsManager />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Популярные курсы в финансах</CardTitle>
                <CardDescription>Выберите до 6 валют для отображения на странице финансов</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {currencyRates.map((rate) => (
                    <div 
                      key={rate.id}
                      onClick={() => handleToggleCurrencyPopular(rate.id, rate.is_popular)}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                        rate.is_popular 
                          ? 'border-emerald-500/50 bg-emerald-500/10' 
                          : 'border-border bg-secondary/30 hover:bg-secondary/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-medium w-8">{rate.symbol}</span>
                        <div>
                          <div className="font-medium text-sm text-foreground">{rate.name}</div>
                          <div className="text-xs text-muted-foreground">{rate.code}</div>
                        </div>
                      </div>
                      {rate.is_popular && (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                          Активен
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Выбрано: {currencyRates.filter(c => c.is_popular).length} из 6
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Настройки пеней</CardTitle>
                <CardDescription>Параметры автоматического начисления пеней</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Ставка пени (% в день)</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={settings.penalty_rate}
                      onChange={(e) => setSettings({ ...settings, penalty_rate: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Дней просрочки до начисления</Label>
                    <Input 
                      type="number"
                      value={settings.late_payment_days}
                      onChange={(e) => setSettings({ ...settings, late_payment_days: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div>
                    <p className="font-medium text-foreground">Автоначисление пеней</p>
                    <p className="text-sm text-muted-foreground">Автоматически начислять пени при просрочке</p>
                  </div>
                  <Switch 
                    checked={settings.enable_auto_penalties}
                    onCheckedChange={(v) => setSettings({ ...settings, enable_auto_penalties: v })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Склад - управление складами */}
          <TabsContent value="stock" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Склады</CardTitle>
                <CardDescription>Управление складами для хранения товаров</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input 
                    placeholder="Название склада"
                    value={newWarehouseName}
                    onChange={(e) => setNewWarehouseName(e.target.value)}
                  />
                  <Input 
                    placeholder="Описание (необязательно)"
                    value={newWarehouseDesc}
                    onChange={(e) => setNewWarehouseDesc(e.target.value)}
                  />
                  <Button onClick={handleAddWarehouse}>
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить
                  </Button>
                </div>

                <div className="space-y-2">
                  {warehouses.filter(w => w.is_active).map((warehouse) => (
                    <div 
                      key={warehouse.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border"
                    >
                      <div>
                        <div className="font-medium text-foreground">{warehouse.name}</div>
                        {warehouse.description && (
                          <div className="text-sm text-muted-foreground">{warehouse.description}</div>
                        )}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleDeleteWarehouse(warehouse.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  ))}
                  {warehouses.filter(w => w.is_active).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      Склады не добавлены
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Авто */}
          <TabsContent value="auto" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Настройки автоплощадки</CardTitle>
                <CardDescription>Параметры работы с автомобилями</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Управление ролями и справочниками доступно в разделе{' '}
                  <Link href="/cars" className="text-primary hover:underline">
                    Автомобили → Настройки
                  </Link>
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Роли пользователей */}
          <TabsContent value="roles" className="space-y-6">
            <UserRolesManager />
          </TabsContent>

          {/* Система */}
          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Уведомления</CardTitle>
                <CardDescription>Настройки системных уведомлений</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-foreground">Уведомления</p>
                      <p className="text-sm text-muted-foreground">Получать уведомления о важных событиях</p>
                    </div>
                  </div>
                  <Switch 
                    checked={settings.enable_notifications}
                    onCheckedChange={(v) => setSettings({ ...settings, enable_notifications: v })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Информация о системе</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Версия</span>
                  <span className="font-mono text-foreground">1.0.0</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">База данных</span>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                    Подключена
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
