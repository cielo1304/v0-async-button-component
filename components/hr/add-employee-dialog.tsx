'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AsyncButton } from '@/components/ui/async-button'
import { UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export function AddEmployeeDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  const [fullName, setFullName] = useState('')
  const [position, setPosition] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  const handleSubmit = async () => {
    if (!fullName) {
      toast.error('Укажите ФИО сотрудника')
      return
    }

    setIsLoading(true)
    try {
      const supabase = createClient()
      
      const { error } = await supabase.from('employees').insert({
        full_name: fullName,
        position: position || null,
        phone: phone || null,
        email: email || null,
        salary_balance: 0,
        is_active: true,
        hired_at: new Date().toISOString(),
      })

      if (error) throw error

      toast.success('Сотрудник добавлен')
      setOpen(false)
      resetForm()
      router.refresh()
    } catch (error) {
      console.error('[v0] Error:', error)
      toast.error('Ошибка при добавлении сотрудника')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setFullName('')
    setPosition('')
    setPhone('')
    setEmail('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-border bg-transparent">
          <UserPlus className="h-4 w-4 mr-2" />
          Добавить сотрудника
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Новый сотрудник</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Добавить работника в систему
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              ФИО *
            </Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Иванов Иван Иванович"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Должность
            </Label>
            <Input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Менеджер"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Телефон
            </Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 999 123-45-67"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase">
              Email
            </Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="employee@company.com"
              type="email"
              className="bg-background border-border"
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <AsyncButton
            isLoading={isLoading}
            loadingText="Добавление..."
            onClick={handleSubmit}
          >
            Добавить
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
