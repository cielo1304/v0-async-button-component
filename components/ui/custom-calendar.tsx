'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Check, ChevronUp, ChevronDown } from 'lucide-react'
import { format, getMonth, getYear } from 'date-fns'

const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

interface CustomCalendarProps {
  selected: DateRange
  onSelect: (range: DateRange) => void
  onClose: () => void
}

export function CustomCalendar({ selected, onSelect, onClose }: CustomCalendarProps) {
  const today = new Date()
  const [viewMonth, setViewMonth] = useState(selected.from ? getMonth(selected.from) : getMonth(today))
  const [viewYear, setViewYear] = useState(selected.from ? getYear(selected.from) : getYear(today))
  const [selectingStart, setSelectingStart] = useState(true)
  const [tempRange, setTempRange] = useState<DateRange>(selected)
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false)

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay()
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate()
  
  const handleDayClick = (day: number) => {
    const clickedDate = new Date(viewYear, viewMonth, day)
    
    if (selectingStart) {
      setTempRange({ from: clickedDate, to: undefined })
      setSelectingStart(false)
    } else {
      if (tempRange.from && clickedDate < tempRange.from) {
        setTempRange({ from: clickedDate, to: tempRange.from })
      } else {
        setTempRange({ from: tempRange.from, to: clickedDate })
      }
      setSelectingStart(true)
    }
  }

  const handleApply = () => {
    if (tempRange.from && tempRange.to) {
      onSelect(tempRange)
      onClose()
    }
  }

  const isInRange = (day: number) => {
    if (!tempRange.from) return false
    const date = new Date(viewYear, viewMonth, day)
    if (tempRange.to) {
      return date >= tempRange.from && date <= tempRange.to
    }
    return date.getTime() === tempRange.from.getTime()
  }

  const isRangeStart = (day: number) => {
    if (!tempRange.from) return false
    const date = new Date(viewYear, viewMonth, day)
    return date.getTime() === tempRange.from.getTime()
  }

  const isRangeEnd = (day: number) => {
    if (!tempRange.to) return false
    const date = new Date(viewYear, viewMonth, day)
    return date.getTime() === tempRange.to.getTime()
  }

  const isToday = (day: number) => {
    const date = new Date(viewYear, viewMonth, day)
    return date.toDateString() === today.toDateString()
  }

  return (
    <div className="p-4 min-w-[320px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={() => {
            if (viewMonth === 0) {
              setViewMonth(11)
              setViewYear(viewYear - 1)
            } else {
              setViewMonth(viewMonth - 1)
            }
          }}
        >
          <ChevronDown className="h-4 w-4 rotate-90" />
        </Button>
        
        <div className="flex items-center gap-2">
          <DropdownMenu open={monthDropdownOpen} onOpenChange={setMonthDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 px-2 font-medium bg-transparent">
                {MONTHS_RU[viewMonth]}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="max-h-[300px] overflow-y-auto">
              {MONTHS_RU.map((month, idx) => (
                <DropdownMenuItem 
                  key={month} 
                  onClick={() => { setViewMonth(idx); setMonthDropdownOpen(false) }}
                  className="flex items-center gap-2"
                >
                  {viewMonth === idx && <Check className="h-4 w-4" />}
                  <span className={viewMonth === idx ? 'font-medium' : ''}>{month}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <div className="flex items-center border rounded-md">
            <span className="px-2 font-mono text-sm">{viewYear}</span>
            <div className="flex flex-col border-l">
              <button 
                className="px-1 py-0.5 hover:bg-secondary/50 transition-colors"
                onClick={() => setViewYear(viewYear + 1)}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button 
                className="px-1 py-0.5 hover:bg-secondary/50 transition-colors border-t"
                onClick={() => setViewYear(viewYear - 1)}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
        
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={() => {
            if (viewMonth === 11) {
              setViewMonth(0)
              setViewYear(viewYear + 1)
            } else {
              setViewMonth(viewMonth + 1)
            }
          }}
        >
          <ChevronDown className="h-4 w-4 -rotate-90" />
        </Button>
      </div>
      
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS_RU.map(day => (
          <div key={day} className="text-center text-xs text-muted-foreground font-medium py-1">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`prev-${i}`} className="text-center py-2 text-muted-foreground/40 text-sm">
            {prevMonthDays - startOffset + i + 1}
          </div>
        ))}
        
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const inRange = isInRange(day)
          const isStart = isRangeStart(day)
          const isEnd = isRangeEnd(day)
          const isTodayDate = isToday(day)
          
          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              className={`
                text-center py-2 text-sm rounded-md transition-colors
                ${inRange ? 'bg-primary/20' : 'hover:bg-secondary/50'}
                ${isStart || isEnd ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}
                ${isTodayDate && !inRange ? 'ring-1 ring-primary' : ''}
              `}
            >
              {day}
            </button>
          )
        })}
        
        {Array.from({ length: 42 - startOffset - daysInMonth }).map((_, i) => (
          <div key={`next-${i}`} className="text-center py-2 text-muted-foreground/40 text-sm">
            {i + 1}
          </div>
        ))}
      </div>
      
      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          {tempRange.from && tempRange.to ? (
            `${format(tempRange.from, 'dd.MM.yyyy')} — ${format(tempRange.to, 'dd.MM.yyyy')}`
          ) : tempRange.from ? (
            `${format(tempRange.from, 'dd.MM.yyyy')} — выберите конец`
          ) : (
            'Выберите начало периода'
          )}
        </div>
        <Button 
          size="sm" 
          onClick={handleApply}
          disabled={!tempRange.from || !tempRange.to}
        >
          Применить
        </Button>
      </div>
    </div>
  )
}
