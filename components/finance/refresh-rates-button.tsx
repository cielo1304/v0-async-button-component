'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, Check, AlertCircle } from 'lucide-react'
import { refreshCurrencyRates } from '@/app/actions/currency-rates'
import { toast } from 'sonner'

export function RefreshRatesButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)

  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      const result = await refreshCurrencyRates()
      
      if (result.success) {
        setLastUpdate(result.updated_at || new Date().toISOString())
        toast.success('Курсы валют обновлены из Exchange Rate API')
      } else {
        toast.error(result.error || 'Не удалось обновить курсы')
      }
    } catch (error) {
      toast.error('Ошибка при обновлении курсов')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleRefresh}
        disabled={isLoading}
        className="gap-2 bg-transparent"
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        {isLoading ? 'Обновление...' : 'Обновить курсы'}
      </Button>
      {lastUpdate && (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Check className="h-3 w-3 text-emerald-400" />
          Обновлено
        </span>
      )}
    </div>
  )
}
