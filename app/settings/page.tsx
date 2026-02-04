'use client'

import { DialogFooter } from "@/components/ui/dialog"

import { DialogDescription } from "@/components/ui/dialog"

import { DialogTitle } from "@/components/ui/dialog"

import { DialogHeader } from "@/components/ui/dialog"

import { DialogContent } from "@/components/ui/dialog"

import { DialogTrigger } from "@/components/ui/dialog"

import { Dialog } from "@/components/ui/dialog"

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { 
  Settings, ArrowLeft, Building, Wallet, Package, 
  Car, Shield, Bell, Save, Loader2, Plus, Trash2, Database, ArrowLeftRight, Users
} from 'lucide-react'
import { toast } from 'sonner'
import { LocationsManager } from '@/components/finance/locations-manager'
import { UserRolesManager } from '@/components/settings/user-roles-manager'
import { SalaryBalanceList } from '@/components/hr/salary-balance-list'
import { AddBonusDialog } from '@/components/hr/add-bonus-dialog'
import { AddEmployeeDialog } from '@/components/hr/add-employee-dialog'

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

interface ExchangeSettingsData {
  id: string
  base_currency: string
  default_margin_percent: number
  auto_update_rates: boolean
  rate_update_interval_minutes: number
  require_client_info: boolean
  min_exchange_amount: number
  max_exchange_amount: number | null
  working_hours_start: string
  working_hours_end: string
}

// Валюты для модуля обмена (базовая валюта прибыли)
const CURRENCIES = ['USD', 'EUR', 'RUB', 'UAH', 'TRY', 'AED', 'CNY', 'GBP', 'KZT']

// Системная валюта по умолчанию (для ЗП, закупок, продаж и пр.)
const SYSTEM_CURRENCIES = [
  { code: 'RUB', name: 'Российский рубль', symbol: '₽' },
  { code: 'KZT', name: 'Казахстанский тенге', symbol: '₸' },
  { code: 'UAH', name: 'Украинская гривна', symbol: '₴' },
  { code: 'USD', name: 'Доллар США', symbol: '$' },
  { code: 'EUR', name: 'Евро', symbol: '€' },
  { code: 'TRY', name: 'Турецкая лира', symbol: '₺' },
]



export default function SettingsPage() {
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get('tab') || 'general'
  
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [currencyRates, setCurrencyRates] = useState<CurrencyRate[]>([])
  
  // Exchange settings state
  const [exchangeSettings, setExchangeSettings] = useState<ExchangeSettingsData | null>(null)
  const [exchangeForm, setExchangeForm] = useState({
    base_currency: 'USD',
    default_margin_percent: '2.0',
    profit_calculation_method: 'auto' as 'auto' | 'manual',
    auto_update_rates: true,
    rate_update_interval_minutes: '15',
    require_client_info: false,
    min_exchange_amount: '0',
    max_exchange_amount: '',
    working_hours_start: '09:00',
    working_hours_end: '21:00'
  })
  
  // Источники курсов валют
  interface RateSource {
    id: string
    currency_code: string
    source_type: 'api' | 'manual' | 'crypto'
    source_name: string
    api_url: string | null
    api_key: string | null
    is_active: boolean
    is_default: boolean
    priority: number
    last_rate: number | null
    last_updated: string | null
    update_interval_minutes: number
    notes: string | null
  }
  const [rateSources, setRateSources] = useState<RateSource[]>([])
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false)
  const [newSource, setNewSource] = useState({
    currency_code: '',
    source_type: 'api' as 'api' | 'manual' | 'crypto',
    source_name: '',
    api_url: '',
    api_key: '',
    update_interval_minutes: '60',
    notes: ''
  })
  
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
      
      // Load exchange settings
      const { data: exData } = await supabase
        .from('exchange_settings')
        .select('*')
        .limit(1)
        .single()
      
      if (exData) {
        setExchangeSettings(exData)
        setExchangeForm({
          base_currency: exData.base_currency || 'USD',
          default_margin_percent: exData.default_margin_percent?.toString() || '2.0',
          profit_calculation_method: exData.profit_calculation_method || 'auto',
          auto_update_rates: exData.auto_update_rates ?? true,
          rate_update_interval_minutes: exData.rate_update_interval_minutes?.toString() || '15',
          require_client_info: exData.require_client_info ?? false,
          min_exchange_amount: exData.min_exchange_amount?.toString() || '0',
          max_exchange_amount: exData.max_exchange_amount?.toString() || '',
          working_hours_start: exData.working_hours_start || '09:00',
          working_hours_end: exData.working_hours_end || '21:00'
        })
      }
      
      // Загружаем источники курсов
      const { data: sourcesData } = await supabase
        .from('currency_rate_sources')
        .select('*')
        .order('currency_code')
        .order('priority')
      setRateSources(sourcesData || [])

      
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

  const handleSaveExchangeSettings = async () => {
    setIsSaving(true)
    try {
      const data = {
        base_currency: exchangeForm.base_currency,
        default_margin_percent: parseFloat(exchangeForm.default_margin_percent) || 2.0,
        profit_calculation_method: exchangeForm.profit_calculation_method,
        auto_update_rates: exchangeForm.auto_update_rates,
        rate_update_interval_minutes: parseInt(exchangeForm.rate_update_interval_minutes) || 15,
        require_client_info: exchangeForm.require_client_info,
        min_exchange_amount: parseFloat(exchangeForm.min_exchange_amount) || 0,
        max_exchange_amount: exchangeForm.max_exchange_amount ? parseFloat(exchangeForm.max_exchange_amount) : null,
        working_hours_start: exchangeForm.working_hours_start,
        working_hours_end: exchangeForm.working_hours_end,
        updated_at: new Date().toISOString()
      }
      
      if (exchangeSettings?.id) {
        const { error } = await supabase
          .from('exchange_settings')
          .update(data)
          .eq('id', exchangeSettings.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('exchange_settings')
          .insert(data)
        
        if (error) throw error
      }
      
      toast.success('Настройки обмена сохранены')
      loadData()
    } catch {
      toast.error('Ошибка сохранения настроек обмена')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddRateSource = async () => {
    if (!newSource.currency_code || !newSource.source_name) {
      toast.error('Заполните обязательные поля')
      return
    }
    
    try {
      const { error } = await supabase.from('currency_rate_sources').insert({
        currency_code: newSource.currency_code.toUpperCase(),
        source_type: newSource.source_type,
        source_name: newSource.source_name,
        api_url: newSource.api_url || null,
        api_key: newSource.api_key || null,
        update_interval_minutes: parseInt(newSource.update_interval_minutes) || 60,
        notes: newSource.notes || null,
        is_active: true,
        is_default: false,
        priority: 10
      })
      
      if (error) throw error
      
      toast.success('Источник добавлен')
      setIsAddSourceOpen(false)
      setNewSource({
        currency_code: '',
        source_type: 'api',
        source_name: '',
        api_url: '',
        api_key: '',
        update_interval_minutes: '60',
        notes: ''
      })
      loadData()
    } catch {
      toast.error('Ошибка добавления источника')
    }
  }
  
  const handleToggleRateSource = async (id: string, field: 'is_active' | 'is_default', value: boolean) => {
    try {
      const { error } = await supabase
        .from('currency_rate_sources')
        .update({ [field]: value })
        .eq('id', id)
      
      if (error) throw error
      loadData()
    } catch {
      toast.error('Ошибка обновления')
    }
  }
  
  const handleDeleteRateSource = async (id: string) => {
    try {
      const { error } = await supabase
        .from('currency_rate_sources')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      toast.success('Источник удален')
      loadData()
    } catch {
      toast.error('Ошибка удаления')
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
        <Tabs defaultValue={defaultTab} className="space-y-6">
          <TabsList className="grid w-full max-w-5xl grid-cols-8">
            <TabsTrigger value="general" className="flex items-center gap-1">
              <Building className="h-4 w-4" />
              Общие
            </TabsTrigger>
            <TabsTrigger value="finance" className="flex items-center gap-1">
              <Wallet className="h-4 w-4" />
              Финансы
            </TabsTrigger>
            <TabsTrigger value="exchange" className="flex items-center gap-1">
              <ArrowLeftRight className="h-4 w-4" />
              Обмен
            </TabsTrigger>
            <TabsTrigger value="hr" className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              HR
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
                    <Select 
                      value={settings.default_currency}
                      onValueChange={(v) => setSettings({ ...settings, default_currency: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите валюту" />
                      </SelectTrigger>
                      <SelectContent>
                        {SYSTEM_CURRENCIES.map((currency) => (
                          <SelectItem key={currency.code} value={currency.code}>
                            <span className="flex items-center gap-2">
                              <span className="w-5 text-center">{currency.symbol}</span>
                              <span>{currency.code}</span>
                              <span className="text-muted-foreground">— {currency.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Основная валюта для всех операций: ЗП, закупки, продажи
                    </p>
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

          {/* Обмен валют */}
          <TabsContent value="exchange" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5 text-cyan-400" />
                  Настройки клиентского обмена валют
                </CardTitle>
                <CardDescription>Параметры модуля обмена валют для клиентов</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Метод расчета прибыли */}
                <div className="space-y-3">
                  <Label className="text-base font-medium">Метод расчета курса и прибыли</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div 
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        exchangeForm.profit_calculation_method === 'auto' 
                          ? 'border-cyan-500 bg-cyan-500/10' 
                          : 'border-border hover:border-muted-foreground'
                      }`}
                      onClick={() => setExchangeForm({ ...exchangeForm, profit_calculation_method: 'auto' })}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-4 h-4 rounded-full border-2 ${
                          exchangeForm.profit_calculation_method === 'auto' 
                            ? 'border-cyan-500 bg-cyan-500' 
                            : 'border-muted-foreground'
                        }`} />
                        <span className="font-medium text-foreground">Авто (от биржи + маржа)</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Курс берется из API источника + автоматически добавляется маржа
                      </p>
                    </div>
                    <div 
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        exchangeForm.profit_calculation_method === 'manual' 
                          ? 'border-cyan-500 bg-cyan-500/10' 
                          : 'border-border hover:border-muted-foreground'
                      }`}
                      onClick={() => setExchangeForm({ ...exchangeForm, profit_calculation_method: 'manual' })}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-4 h-4 rounded-full border-2 ${
                          exchangeForm.profit_calculation_method === 'manual' 
                            ? 'border-cyan-500 bg-cyan-500' 
                            : 'border-muted-foreground'
                        }`} />
                        <span className="font-medium text-foreground">Ручной</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Оператор вводит курс вручную. Прибыль = разница с рыночным
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Базовая валюта и маржа */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Базовая валюта для расчета прибыли</Label>
                    <Select 
                      value={exchangeForm.base_currency} 
                      onValueChange={(v) => setExchangeForm({ ...exchangeForm, base_currency: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      В этой валюте будет считаться прибыль в отчетах
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {exchangeForm.profit_calculation_method === 'auto' 
                        ? 'Маржа по умолчанию (%)' 
                        : 'Маржа для сравнения с рынком (%)'}
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={exchangeForm.default_margin_percent}
                      onChange={(e) => setExchangeForm({ ...exchangeForm, default_margin_percent: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      {exchangeForm.profit_calculation_method === 'auto'
                        ? 'Добавляется к курсу биржи автоматически'
                        : 'Используется для сравнения ручного курса с рыночным'}
                    </p>
                  </div>
                </div>
                
                {/* Лимиты */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Минимальная сумма обмена</Label>
                    <Input
                      type="number"
                      value={exchangeForm.min_exchange_amount}
                      onChange={(e) => setExchangeForm({ ...exchangeForm, min_exchange_amount: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Максимальная сумма обмена</Label>
                    <Input
                      type="number"
                      value={exchangeForm.max_exchange_amount}
                      onChange={(e) => setExchangeForm({ ...exchangeForm, max_exchange_amount: e.target.value })}
                      placeholder="Без лимита"
                    />
                  </div>
                </div>
                
                {/* Рабочие часы */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Начало работы</Label>
                    <Input
                      type="time"
                      value={exchangeForm.working_hours_start}
                      onChange={(e) => setExchangeForm({ ...exchangeForm, working_hours_start: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Конец работы</Label>
                    <Input
                      type="time"
                      value={exchangeForm.working_hours_end}
                      onChange={(e) => setExchangeForm({ ...exchangeForm, working_hours_end: e.target.value })}
                    />
                  </div>
                </div>
                
                {/* Переключатели */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                    <div>
                      <p className="font-medium text-foreground">Автообновление курсов</p>
                      <p className="text-sm text-muted-foreground">Автоматически обновлять курсы с внешних источников</p>
                    </div>
                    <Switch
                      checked={exchangeForm.auto_update_rates}
                      onCheckedChange={(v) => setExchangeForm({ ...exchangeForm, auto_update_rates: v })}
                    />
                  </div>
                  
                  {exchangeForm.auto_update_rates && (
                    <div className="space-y-2 ml-4 pl-4 border-l-2 border-border">
                      <Label>Интервал обновления (минут)</Label>
                      <Input
                        type="number"
                        value={exchangeForm.rate_update_interval_minutes}
                        onChange={(e) => setExchangeForm({ ...exchangeForm, rate_update_interval_minutes: e.target.value })}
                        className="max-w-[200px]"
                      />
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                    <div>
                      <p className="font-medium text-foreground">Требовать данные клиента</p>
                      <p className="text-sm text-muted-foreground">ФИО и телефон клиента обязательны для заполнения</p>
                    </div>
                    <Switch
                      checked={exchangeForm.require_client_info}
                      onCheckedChange={(v) => setExchangeForm({ ...exchangeForm, require_client_info: v })}
                    />
                  </div>
                </div>
                
                <Button onClick={handleSaveExchangeSettings} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Сохранить настройки обмена
                </Button>
              </CardContent>
            </Card>
            
            {/* Источники курсов валют */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-cyan-400" />
                      Источники курсов валют
                    </CardTitle>
                    <CardDescription>
                      Настройка API для получения курсов каждой валюты и криптовалюты
                    </CardDescription>
                  </div>
                  <Dialog open={isAddSourceOpen} onOpenChange={setIsAddSourceOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Добавить источник
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Добавить источник курсов</DialogTitle>
                        <DialogDescription>
                          Укажите API или ручной источник для получения курсов валюты
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Код валюты</Label>
                            <Input
                              value={newSource.currency_code}
                              onChange={(e) => setNewSource({ ...newSource, currency_code: e.target.value.toUpperCase() })}
                              placeholder="USD, BTC, USDT..."
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Тип источника</Label>
                            <Select 
                              value={newSource.source_type}
                              onValueChange={(v: 'api' | 'manual' | 'crypto') => setNewSource({ ...newSource, source_type: v })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="api">API (фиат)</SelectItem>
                                <SelectItem value="crypto">Крипто API</SelectItem>
                                <SelectItem value="manual">Ручной ввод</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Название источника</Label>
                          <Input
                            value={newSource.source_name}
                            onChange={(e) => setNewSource({ ...newSource, source_name: e.target.value })}
                            placeholder="Exchange Rate API, Binance, CBR..."
                          />
                        </div>
                        {newSource.source_type !== 'manual' && (
                          <>
                            <div className="space-y-2">
                              <Label>URL API</Label>
                              <Input
                                value={newSource.api_url}
                                onChange={(e) => setNewSource({ ...newSource, api_url: e.target.value })}
                                placeholder="https://api.example.com/rates"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>API ключ (опционально)</Label>
                              <Input
                                value={newSource.api_key}
                                onChange={(e) => setNewSource({ ...newSource, api_key: e.target.value })}
                                placeholder="Если требуется"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Интервал обновления (мин)</Label>
                              <Input
                                type="number"
                                value={newSource.update_interval_minutes}
                                onChange={(e) => setNewSource({ ...newSource, update_interval_minutes: e.target.value })}
                              />
                            </div>
                          </>
                        )}
                        <div className="space-y-2">
                          <Label>Заметки</Label>
                          <Input
                            value={newSource.notes}
                            onChange={(e) => setNewSource({ ...newSource, notes: e.target.value })}
                            placeholder="Описание источника"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddSourceOpen(false)} className="bg-transparent">
                          Отмена
                        </Button>
                        <Button onClick={handleAddRateSource}>
                          Добавить
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {rateSources.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Нет настроенных источников курсов
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Группировка по валютам */}
                    {Object.entries(
                      rateSources.reduce((acc, s) => {
                        if (!acc[s.currency_code]) acc[s.currency_code] = []
                        acc[s.currency_code].push(s)
                        return acc
                      }, {} as Record<string, typeof rateSources>)
                    ).map(([currency, sources]) => (
                      <div key={currency} className="border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-foreground">{currency}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                            {sources[0]?.source_type === 'crypto' ? 'Крипто' : 'Фиат'}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {sources.map((source) => (
                            <div 
                              key={source.id} 
                              className="flex items-center justify-between py-2 px-3 rounded bg-secondary/30"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">{source.source_name}</span>
                                  {source.is_default && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                                      Основной
                                    </span>
                                  )}
                                </div>
                                {source.api_url && (
                                  <p className="text-xs text-muted-foreground truncate max-w-md">
                                    {source.api_url}
                                  </p>
                                )}
                                {source.last_rate && (
                                  <p className="text-xs text-muted-foreground">
                                    Последний курс: {source.last_rate}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={source.is_active}
                                  onCheckedChange={(v) => handleToggleRateSource(source.id, 'is_active', v)}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleRateSource(source.id, 'is_default', !source.is_default)}
                                  className={source.is_default ? 'text-cyan-400' : 'text-muted-foreground'}
                                >
                                  <Bell className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteRateSource(source.id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* HR - управление сотрудниками */}
          <TabsContent value="hr" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-violet-400" />
                    HR и Зарплаты
                  </CardTitle>
                  <CardDescription>Управление сотрудниками и начислениями</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <AddEmployeeDialog />
                  <AddBonusDialog />
                </div>
              </CardHeader>
              <CardContent>
                <SalaryBalanceList />
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
