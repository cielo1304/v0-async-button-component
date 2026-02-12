'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ShieldAlert } from 'lucide-react'

interface Employee {
  id: string
  full_name: string
  position?: string
}

interface GodModeActorSelectorProps {
  value?: string
  onChange: (employeeId: string | undefined) => void
  disabled?: boolean
  label?: string
  description?: string
}

/**
 * GodModeActorSelector - allows admins to perform actions on behalf of other employees
 * This is useful for correcting historical data or performing administrative actions.
 * 
 * Usage:
 * <GodModeActorSelector 
 *   value={godmodeActorId} 
 *   onChange={setGodmodeActorId}
 * />
 */
export function GodModeActorSelector({
  value,
  onChange,
  disabled = false,
  label = 'God Mode: Act as Employee',
  description = 'Select an employee to perform this action on their behalf (admin only)',
}: GodModeActorSelectorProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadEmployees() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, position')
        .eq('is_active', true)
        .order('full_name')

      if (error) {
        console.error('[v0] GodModeActorSelector: Failed to load employees:', error)
        setLoading(false)
        return
      }

      setEmployees(data || [])
      setLoading(false)
    }

    loadEmployees()
  }, [])

  return (
    <div className="space-y-2">
      <Alert className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950">
        <ShieldAlert className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        <AlertDescription className="text-sm text-orange-800 dark:text-orange-200">
          {description}
        </AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        <Label htmlFor="godmode-actor">{label}</Label>
        <Select
          value={value || 'none'}
          onValueChange={(val) => onChange(val === 'none' ? undefined : val)}
          disabled={disabled || loading}
        >
          <SelectTrigger id="godmode-actor" className="w-full">
            <SelectValue placeholder={loading ? 'Loading employees...' : 'Select employee (optional)'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">No God Mode (use current user)</span>
            </SelectItem>
            {employees.map((emp) => (
              <SelectItem key={emp.id} value={emp.id}>
                <div className="flex flex-col">
                  <span className="font-medium">{emp.full_name}</span>
                  {emp.position && (
                    <span className="text-xs text-muted-foreground">{emp.position}</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value && (
          <p className="text-xs text-orange-600 dark:text-orange-400">
            This action will be recorded as performed by the selected employee
          </p>
        )}
      </div>
    </div>
  )
}
