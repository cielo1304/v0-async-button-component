'use client'

import React from "react"

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Cashbox } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { Loader2, MapPin, Wallet, Building, User, Truck, Lock, Globe, ChevronDown, ChevronRight, Settings, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EditCashboxDialog } from './edit-cashbox-dialog'

const CASHBOX_TYPE_LABELS: Record<string, string> = {
  CASH: 'Наличные',
  BANK: 'Банк',
  CRYPTO: 'Крипто',
  TRADE_IN: 'Trade-In',
}

const LOCATION_ICONS: Record<string, React.ReactNode> = {
  'Офис': <Building className="h-4 w-4" />,
  'У шефа': <User className="h-4 w-4" />,
  'У курьера': <Truck className="h-4 w-4" />,
  'Банк': <Building className="h-4 w-4" />,
  'Сейф': <Lock className="h-4 w-4" />,
  'Удаленно': <Globe className="h-4 w-4" />,
}

interface CashboxWithLocation extends Cashbox {
  location?: string | null
  holder_name?: string | null
  holder_phone?: string | null
}

export function CashboxList() {
  const [cashboxes, setCashboxes] = useState<CashboxWithLocation[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [collapsedLocations, setCollapsedLocations] = useState<Set<string>>(new Set())
  const [editingCashbox, setEditingCashbox] = useState<CashboxWithLocation | null>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function loadData() {
      try {
        const [cashboxesRes, locationsRes] = await Promise.all([
          supabase
            .from('cashboxes')
            .select('*')
            .eq('is_archived', false)
            .order('created_at', { ascending: false }),
          supabase
            .from('cashbox_locations')
            .select('id, name')
            .eq('is_active', true)
            .order('sort_order')
        ])

        if (cashboxesRes.error) throw cashboxesRes.error
        setCashboxes(cashboxesRes.data || [])
        setLocations(locationsRes.data || [])
      } catch {
        // Silent fail
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  // Группировка касс по локациям
  const cashboxesByLocation = useMemo(() => {
    const grouped: Record<string, CashboxWithLocation[]> = {}
    
    // Сначала добавляем все локации из справочника
    locations.forEach(loc => {
      grouped[loc.name] = []
    })
    
    // Добавляем "Без локации" для касс без привязки
    grouped['Без локации'] = []
    
    // Распределяем кассы по группам
    cashboxes.forEach(cashbox => {
      const location = cashbox.location || 'Без локации'
      if (!grouped[location]) {
        grouped[location] = []
      }
      grouped[location].push(cashbox)
    })
    
    return grouped
  }, [cashboxes, locations])

  // Подсчет общего баланса по локации
  const getLocationTotal = (locationCashboxes: CashboxWithLocation[]) => {
    const totals: Record<string, number> = {}
    locationCashboxes.forEach(c => {
      const currency = c.currency
      totals[currency] = (totals[currency] || 0) + Number(c.balance)
    })
    return totals
  }

  const toggleLocation = (location: string) => {
    const newCollapsed = new Set(collapsedLocations)
    if (newCollapsed.has(location)) {
      newCollapsed.delete(location)
    } else {
      newCollapsed.add(location)
    }
    setCollapsedLocations(newCollapsed)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Фильтруем пустые группы, кроме "Без локации" если там есть кассы
  const activeLocations = Object.entries(cashboxesByLocation)
    .filter(([_, items]) => items.length > 0)
    .sort(([a], [b]) => {
      if (a === 'Без локации') return 1
      if (b === 'Без локации') return -1
      return 0
    })

  if (cashboxes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Кассы не найдены. Добавьте первую кассу.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {activeLocations.map(([location, locationCashboxes]) => {
        const totals = getLocationTotal(locationCashboxes)
        const isCollapsed = collapsedLocations.has(location)
        const Icon = LOCATION_ICONS[location] || <MapPin className="h-4 w-4" />

        return (
          <Card key={location} className="bg-card border-border">
            <CardHeader 
              className="cursor-pointer hover:bg-secondary/30 transition-colors py-3"
              onClick={() => toggleLocation(location)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary/50 text-muted-foreground">
                    {Icon}
                  </div>
                  <div>
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      {location}
                      <Badge variant="secondary" className="ml-2">
                        {locationCashboxes.length}
                      </Badge>
                    </CardTitle>
                    <div className="flex gap-3 mt-1">
                      {Object.entries(totals).map(([currency, amount]) => (
                        <span key={currency} className="text-sm font-mono text-muted-foreground">
                          {amount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} {currency}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            
            {!isCollapsed && (
              <CardContent className="pt-0 pb-3">
                <div className="space-y-2">
                  {locationCashboxes.map((cashbox) => (
                    <div
                      key={cashbox.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group"
                    >
                      <div 
                        className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => router.push(`/finance/${cashbox.id}`)}
                      >
                        <div className="p-2 rounded-lg bg-background">
                          <Wallet className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground flex items-center gap-2">
                            {cashbox.name}
                            {cashbox.is_hidden && (
                              <EyeOff className="h-3 w-3 text-amber-400" title="Скрытая касса" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{CASHBOX_TYPE_LABELS[cashbox.type] || cashbox.type}</span>
                            {cashbox.holder_name && (
                              <>
                                <span>•</span>
                                <span>{cashbox.holder_name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className={`font-mono font-semibold ${Number(cashbox.balance) >= 0 ? 'text-foreground' : 'text-red-400'}`}>
                            {Number(cashbox.balance).toLocaleString('ru-RU', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                          <div className="text-xs text-muted-foreground">{cashbox.currency}</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingCashbox(cashbox)
                          }}
                        >
                          <Settings className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}

      {/* Диалог редактирования кассы */}
      {editingCashbox && (
        <EditCashboxDialog
          cashbox={editingCashbox}
          open={!!editingCashbox}
          onOpenChange={(open) => {
            if (!open) setEditingCashbox(null)
          }}
        />
      )}
    </div>
  )
}
