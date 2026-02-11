'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Bell, Truck, Users, Save, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import type { ClientExchangeOperation } from '@/lib/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AudienceNotes } from '@/components/shared/audience-notes'

const FOLLOWUP_STATUS_MAP: Record<string, { label: string; color: string }> = {
  none: { label: 'Нет', color: 'bg-muted text-muted-foreground border-border' },
  callback: { label: 'Перезвонить', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  waiting_funds: { label: 'Ожидание средств', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ready_for_pickup: { label: 'Готово к выдаче', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  in_delivery: { label: 'В доставке', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  done: { label: 'Завершено', color: 'bg-muted text-muted-foreground border-border' },
}

const HANDOVER_METHODS: Record<string, string> = {
  cash_office: 'Выдача в офисе',
  courier: 'Курьер',
  bank_transfer: 'Банковский перевод',
  crypto_wallet: 'Крипто кошелёк',
  other: 'Другое',
}

interface Props {
  operation: ClientExchangeOperation
  supabase: SupabaseClient
  onUpdate: () => void
}

export function OperationExtras({ operation, supabase, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)

  // Локальное состояние для редактирования
  const [followupStatus, setFollowupStatus] = useState((operation as any).followup_status || 'none')
  const [handoverMethod, setHandoverMethod] = useState((operation as any).handover_method || '')
  const [beneficiaryName, setBeneficiaryName] = useState((operation as any).beneficiary_name || '')
  const [beneficiaryPhone, setBeneficiaryPhone] = useState((operation as any).beneficiary_phone || '')
  const [beneficiaryDoc, setBeneficiaryDoc] = useState((operation as any).beneficiary_document || '')

  const currentFollowup = FOLLOWUP_STATUS_MAP[(operation as any).followup_status || 'none'] || FOLLOWUP_STATUS_MAP.none
  const hasHandover = !!(operation as any).handover_method
  const hasBeneficiary = !!(operation as any).beneficiary_name

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('client_exchange_operations')
        .update({
          followup_status: followupStatus === 'none' ? null : followupStatus,
          handover_method: handoverMethod || null,
          beneficiary_name: beneficiaryName || null,
          beneficiary_phone: beneficiaryPhone || null,
          beneficiary_document: beneficiaryDoc || null,
        })
        .eq('id', operation.id)

      if (error) throw error
      toast.success('Данные обновлены')
      onUpdate()
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pt-3 border-t border-border space-y-3">
      {/* Краткий статус + toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
            <Badge variant="outline" className={`text-xs ${currentFollowup.color}`}>
              {currentFollowup.label}
            </Badge>
          </div>
          {hasHandover && (
            <div className="flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {HANDOVER_METHODS[(operation as any).handover_method] || (operation as any).handover_method}
              </span>
            </div>
          )}
          {hasBeneficiary && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{(operation as any).beneficiary_name}</span>
            </div>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* Follow-up дата/заметка (из новых полей) */}
      {((operation as any).followup_at || (operation as any).followup_note) && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm">
          <Bell className="h-4 w-4 text-amber-400 shrink-0" />
          <div>
            {(operation as any).followup_at && (
              <span className="font-medium text-amber-400 mr-2">
                {new Date((operation as any).followup_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {(operation as any).followup_note && (
              <span className="text-muted-foreground">{(operation as any).followup_note}</span>
            )}
          </div>
        </div>
      )}

      {/* Snapshot курсов */}
      {(operation as any).rates_snapshot && (
        <div className="px-3 py-2 rounded-lg bg-secondary/30 border border-border text-xs space-y-1">
          <div className="text-muted-foreground font-medium">Зафиксированные курсы:</div>
          {((operation as any).rates_snapshot?.rates || []).map((r: any, i: number) => (
            <div key={i} className="flex justify-between">
              <span className="text-muted-foreground">
                {r.lineCurrency} ({r.direction === 'give' ? 'покупка' : 'продажа'})
              </span>
              <span className="font-mono text-foreground">
                applied: {r.appliedRate ?? '-'} / market: {r.marketRate ?? '-'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Бенефициар контакт (из нового поля) */}
      {(operation as any).beneficiary_contact_id && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-sm">
          <Users className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-muted-foreground">Бенефициар (контакт):</span>
          <span className="text-foreground font-medium">{(operation as any).beneficiary_contact_id}</span>
        </div>
      )}

      {/* Заметки клиентской стороны */}
      {(operation as any).client_audience_notes && Object.keys((operation as any).client_audience_notes).length > 0 && (
        <AudienceNotes
          notes={(operation as any).client_audience_notes}
          onChange={() => {}}
          readOnly
          inline
        />
      )}

      {/* Раскрытая форма редактирования */}
      {expanded && (
        <div className="space-y-4 pt-2">
          {/* Followup */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" /> Followup статус
            </Label>
            <Select value={followupStatus} onValueChange={setFollowupStatus}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FOLLOWUP_STATUS_MAP).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Способ выдачи */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Способ выдачи
            </Label>
            <Select value={handoverMethod} onValueChange={setHandoverMethod}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Не указано" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none_selected">Не указано</SelectItem>
                {Object.entries(HANDOVER_METHODS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Бенефициар */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Бенефициар (получатель средств)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={beneficiaryName}
                onChange={e => setBeneficiaryName(e.target.value)}
                placeholder="ФИО"
                className="h-8 text-sm"
              />
              <Input
                value={beneficiaryPhone}
                onChange={e => setBeneficiaryPhone(e.target.value)}
                placeholder="Телефон"
                className="h-8 text-sm"
              />
            </div>
            <Input
              value={beneficiaryDoc}
              onChange={e => setBeneficiaryDoc(e.target.value)}
              placeholder="Документ / ID"
              className="h-8 text-sm"
            />
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
