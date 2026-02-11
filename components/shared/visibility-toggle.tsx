'use client'

import { useState } from 'react'
import { Eye, EyeOff, Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

// Role groups for the selector
const ROLE_GROUPS = [
  {
    label: 'Обмен',
    codes: [
      { code: 'EXCHANGE_VIEW', label: 'Просмотр' },
      { code: 'EXCHANGE_WORK', label: 'Работа' },
      { code: 'EXCHANGE_MANAGE', label: 'Управление' },
    ],
  },
  {
    label: 'Финансы',
    codes: [
      { code: 'FINANCE_VIEW', label: 'Просмотр' },
      { code: 'FINANCE_WORK', label: 'Работа' },
      { code: 'FINANCE_MANAGE', label: 'Управление' },
    ],
  },
  {
    label: 'Сделки',
    codes: [
      { code: 'DEALS_VIEW', label: 'Просмотр' },
      { code: 'DEALS_WORK', label: 'Работа' },
      { code: 'DEALS_MANAGE', label: 'Управление' },
    ],
  },
  {
    label: 'Имущество',
    codes: [
      { code: 'ASSETS_VIEW', label: 'Просмотр' },
      { code: 'ASSETS_WORK', label: 'Работа' },
      { code: 'ASSETS_MANAGE', label: 'Управление' },
    ],
  },
  {
    label: 'Авто',
    codes: [
      { code: 'AUTO_VIEW', label: 'Просмотр' },
      { code: 'AUTO_WORK', label: 'Работа' },
      { code: 'AUTO_MANAGE', label: 'Управление' },
    ],
  },
  {
    label: 'Склад',
    codes: [
      { code: 'STOCK_VIEW', label: 'Просмотр' },
      { code: 'STOCK_WORK', label: 'Работа' },
      { code: 'STOCK_MANAGE', label: 'Управление' },
    ],
  },
]

interface VisibilityToggleProps {
  mode: 'public' | 'restricted'
  allowedRoleCodes: string[]
  onModeChange: (mode: 'public' | 'restricted') => void
  onRoleCodesChange: (codes: string[]) => void
  /** Compact mode: just an icon button */
  compact?: boolean
  /** Saving callback */
  onSave?: () => void
}

export function VisibilityToggle({
  mode,
  allowedRoleCodes,
  onModeChange,
  onRoleCodesChange,
  compact = false,
  onSave,
}: VisibilityToggleProps) {
  const [open, setOpen] = useState(false)
  const isRestricted = mode === 'restricted'

  const toggleRole = (code: string) => {
    if (allowedRoleCodes.includes(code)) {
      onRoleCodesChange(allowedRoleCodes.filter(c => c !== code))
    } else {
      onRoleCodesChange([...allowedRoleCodes, code])
    }
  }

  const icon = isRestricted ? (
    <EyeOff className="h-4 w-4 text-amber-400" />
  ) : (
    <Eye className="h-4 w-4 text-muted-foreground" />
  )

  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 bg-transparent ${isRestricted ? 'text-amber-400 hover:text-amber-300' : 'text-muted-foreground hover:text-foreground'}`}
            title={isRestricted ? `Ограничено (${allowedRoleCodes.length} ролей)` : 'Публично'}
          >
            {icon}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <VisibilityContent
            mode={mode}
            allowedRoleCodes={allowedRoleCodes}
            onModeChange={onModeChange}
            toggleRole={toggleRole}
            onSave={() => { onSave?.(); setOpen(false) }}
          />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div className={`rounded-lg border p-3 space-y-3 ${isRestricted ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{isRestricted ? 'Ограниченный доступ' : 'Публично'}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs bg-transparent"
          onClick={() => onModeChange(isRestricted ? 'public' : 'restricted')}
        >
          {isRestricted ? 'Сделать публичным' : 'Ограничить'}
        </Button>
      </div>
      {isRestricted && (
        <VisibilityContent
          mode={mode}
          allowedRoleCodes={allowedRoleCodes}
          onModeChange={onModeChange}
          toggleRole={toggleRole}
          onSave={onSave}
          inline
        />
      )}
    </div>
  )
}

function VisibilityContent({
  mode,
  allowedRoleCodes,
  onModeChange,
  toggleRole,
  onSave,
  inline,
}: {
  mode: 'public' | 'restricted'
  allowedRoleCodes: string[]
  onModeChange: (m: 'public' | 'restricted') => void
  toggleRole: (code: string) => void
  onSave?: () => void
  inline?: boolean
}) {
  const isRestricted = mode === 'restricted'

  return (
    <div className="space-y-3">
      {!inline && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium">Видимость</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs bg-transparent"
            onClick={() => onModeChange(isRestricted ? 'public' : 'restricted')}
          >
            {isRestricted ? 'Публично' : 'Ограничить'}
          </Button>
        </div>
      )}
      {isRestricted && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          <p className="text-xs text-muted-foreground">Кому видно:</p>
          {ROLE_GROUPS.map(group => (
            <div key={group.label} className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{group.label}</p>
              <div className="flex flex-wrap gap-1">
                {group.codes.map(({ code, label }) => {
                  const checked = allowedRoleCodes.includes(code)
                  return (
                    <Badge
                      key={code}
                      variant="outline"
                      className={`cursor-pointer text-[10px] transition-colors ${
                        checked
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          : 'bg-transparent text-muted-foreground border-border hover:border-amber-500/30'
                      }`}
                      onClick={() => toggleRole(code)}
                    >
                      {label}
                    </Badge>
                  )
                })}
              </div>
            </div>
          ))}
          {allowedRoleCodes.length === 0 && (
            <p className="text-xs text-amber-400">Выберите хотя бы одну роль</p>
          )}
        </div>
      )}
      {onSave && (
        <Button size="sm" className="w-full h-7 text-xs" onClick={onSave}>
          Сохранить
        </Button>
      )}
    </div>
  )
}

/** Simple read-only badge for lists */
export function VisibilityBadge({ mode, count }: { mode?: string; count?: number }) {
  if (!mode || mode === 'public') return null
  return (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
      <EyeOff className="h-3 w-3 mr-1" />
      {count ? `${count} ролей` : 'Скрыто'}
    </Badge>
  )
}
