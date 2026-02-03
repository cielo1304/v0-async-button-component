'use client'

import React, { forwardRef, useState, useEffect } from 'react'
import { Input, type InputProps } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const CURRENCIES = ['RUB', 'USD', 'USDT', 'EUR'] as const
type Currency = (typeof CURRENCIES)[number]

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  RUB: '₽',
  USD: '$',
  USDT: '₮',
  EUR: '€',
}

interface MoneyInputProps extends Omit<InputProps, 'type' | 'value' | 'onChange'> {
  value?: number | null
  currency?: Currency
  onValueChange?: (value: number | null) => void
  onCurrencyChange?: (currency: Currency) => void
  showCurrency?: boolean
  allowNegative?: boolean
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      value,
      currency = 'RUB',
      onValueChange,
      onCurrencyChange,
      showCurrency = true,
      allowNegative = false,
      className,
      ...props
    },
    ref
  ) => {
    const [displayValue, setDisplayValue] = useState<string>(
      value != null ? value.toString() : ''
    )

    useEffect(() => {
      if (value != null) {
        setDisplayValue(value.toString())
      } else {
        setDisplayValue('')
      }
    }, [value])

    const formatNumber = (val: string): string => {
      let num = val.replace(/[^\d.-]/g, '')
      
      if (!allowNegative) {
        num = num.replace(/-/g, '')
      } else {
        // Only allow negative sign at the beginning
        const hasNegative = num.startsWith('-')
        num = num.replace(/-/g, '')
        if (hasNegative) num = `-${num}`
      }
      
      const parts = num.split('.')
      
      if (parts.length > 2) {
        return `${parts[0]}.${parts.slice(1).join('')}`
      }
      
      if (parts[1] && parts[1].length > 2) {
        return `${parts[0]}.${parts[1].slice(0, 2)}`
      }
      
      return num
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatNumber(e.target.value)
      setDisplayValue(formatted)
      
      const numValue = Number.parseFloat(formatted)
      onValueChange?.(Number.isNaN(numValue) ? null : numValue)
    }

    const handleBlur = () => {
      if (displayValue && !Number.isNaN(Number(displayValue))) {
        const formatted = Number(displayValue).toFixed(2)
        setDisplayValue(formatted)
        onValueChange?.(Number(formatted))
      }
    }

    return (
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">
            {CURRENCY_SYMBOLS[currency]}
          </span>
          <Input
            ref={ref}
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            className={cn(
              'font-mono text-right pl-8 bg-secondary border-border text-foreground',
              showCurrency && 'pr-14',
              className
            )}
            placeholder="0.00"
            {...props}
          />
          {showCurrency && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">
              {currency}
            </span>
          )}
        </div>
        {showCurrency && onCurrencyChange && (
          <Select value={currency} onValueChange={onCurrencyChange}>
            <SelectTrigger className="w-[100px] bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((curr) => (
                <SelectItem key={curr} value={curr}>
                  {curr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    )
  }
)

MoneyInput.displayName = 'MoneyInput'
