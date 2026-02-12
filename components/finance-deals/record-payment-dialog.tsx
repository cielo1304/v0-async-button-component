'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { recordFinancePayment } from '@/app/actions/finance-deals'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { GodModeActorSelector } from '@/components/finance/god-mode-actor-selector'
import { AsyncButton } from '@/components/ui/async-button'
import type { Currency } from '@/lib/types/database'

interface Cashbox {
  id: string
  name: string
  currency: Currency
  balance: number
}

interface RecordPaymentDialogProps {
  financeDealId: string
  dealCurrency: Currency
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RecordPaymentDialog({
  financeDealId,
  dealCurrency,
  open,
  onOpenChange,
}: RecordPaymentDialogProps) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [cashboxId, setCashboxId] = useState<string>()
  const [note, setNote] = useState('')
  const [godmodeActorId, setGodmodeActorId] = useState<string>()
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([])
  const [loading, setLoading] = useState(false)

  // Load cashboxes when dialog opens
  useEffect(() => {
    if (open) {
      loadCashboxes()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function loadCashboxes() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('cashboxes')
      .select('id, name, currency, balance')
      .eq('is_archived', false)
      .order('name')

    if (error) {
      console.error('[v0] Failed to load cashboxes:', error)
      return
    }

    setCashboxes(data || [])
  }

  async function handleSubmit() {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }

    setLoading(true)

    try {
      const result = await recordFinancePayment({
        finance_deal_id: financeDealId,
        payment_amount: parseFloat(amount),
        currency: dealCurrency,
        cashbox_id: cashboxId,
        note: note || undefined,
        godmode_actor_employee_id: godmodeActorId,
      })

      if (!result.success) {
        toast.error(result.error || 'Failed to record payment')
        setLoading(false)
        return
      }

      toast.success('Payment recorded successfully', {
        description: `Principal: ${result.principal_paid}, Interest: ${result.interest_paid}`,
      })

      // Reset form
      setAmount('')
      setCashboxId(undefined)
      setNote('')
      setGodmodeActorId(undefined)

      // Close dialog and refresh
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      console.error('[v0] recordFinancePayment error:', err)
      toast.error('An unexpected error occurred')
      setLoading(false)
    }
  }

  const matchingCashboxes = cashboxes.filter((cb) => cb.currency === dealCurrency)
  const hasMatchingCashbox = matchingCashboxes.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record a payment against this finance deal. Payment will be distributed across the
            schedule (FIFO) to cover principal and interest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Payment Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="amount">
              Payment Amount ({dealCurrency}) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Cashbox Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="cashbox">Source Cashbox (optional)</Label>
            {!hasMatchingCashbox && (
              <p className="text-sm text-orange-600 dark:text-orange-400">
                No cashboxes with {dealCurrency} currency found. Payment will be recorded without
                cashbox deduction.
              </p>
            )}
            {hasMatchingCashbox && (
              <Select
                value={cashboxId || 'none'}
                onValueChange={(val) => setCashboxId(val === 'none' ? undefined : val)}
                disabled={loading}
              >
                <SelectTrigger id="cashbox">
                  <SelectValue placeholder="Select cashbox (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">No cashbox (record only)</span>
                  </SelectItem>
                  {matchingCashboxes.map((cb) => (
                    <SelectItem key={cb.id} value={cb.id}>
                      {cb.name} ({cb.currency}) - Balance: {cb.balance.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              placeholder="Add a note about this payment..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={loading}
              rows={3}
            />
          </div>

          {/* God Mode Actor Selector */}
          <GodModeActorSelector
            value={godmodeActorId}
            onChange={setGodmodeActorId}
            disabled={loading}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <AsyncButton onClick={handleSubmit} disabled={loading || !amount}>
            Record Payment
          </AsyncButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
