'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, Loader2, Phone } from 'lucide-react'
import { createContact, type CreateContactPayload } from '@/app/actions/contacts'
import { toast } from 'sonner'

interface CreateContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

export function CreateContactDialog({ open, onOpenChange, onCreated }: CreateContactDialogProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [nickname, setNickname] = useState('')
  const [mobilePhone, setMobilePhone] = useState('')
  const [extraPhones, setExtraPhones] = useState<string[]>([])
  const [organization, setOrganization] = useState('')
  const [comment, setComment] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const resetForm = () => {
    setFirstName('')
    setLastName('')
    setNickname('')
    setMobilePhone('')
    setExtraPhones([])
    setOrganization('')
    setComment('')
  }

  const addExtraPhone = () => {
    if (extraPhones.length >= 3) return
    setExtraPhones([...extraPhones, ''])
  }

  const updateExtraPhone = (index: number, value: string) => {
    const updated = [...extraPhones]
    updated[index] = value
    setExtraPhones(updated)
  }

  const removeExtraPhone = (index: number) => {
    setExtraPhones(extraPhones.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!firstName.trim()) {
      toast.error('Введите имя контакта')
      return
    }

    setIsSaving(true)
    try {
      const payload: CreateContactPayload = {
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        nickname: nickname.trim() || undefined,
        mobile_phone: mobilePhone.trim() || undefined,
        extra_phones: extraPhones.filter(p => p.trim()),
        organization: organization.trim() || undefined,
        comment: comment.trim() || undefined,
      }

      const result = await createContact(payload)
      toast.success(`Контакт "${result.display_name}" создан`)
      resetForm()
      onOpenChange(false)
      onCreated?.()
    } catch (err) {
      const e = err as Error & { code?: string }
      if (e.code === 'no_company') {
        toast.error('Вы не состоите в компании')
      } else if (
        e.message?.includes('new row violates') ||
        e.message?.includes('violates row-level security') ||
        e.message?.includes('insufficient_privilege') ||
        e.message?.includes('permission denied')
      ) {
        toast.error('Недостаточно прав для создания контакта')
      } else {
        toast.error('Ошибка создания контакта')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = (value: boolean) => {
    if (!isSaving) {
      if (!value) resetForm()
      onOpenChange(value)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Новый контакт</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">
                Имя <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                placeholder="Иван"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Фамилия</Label>
              <Input
                id="lastName"
                placeholder="Петров"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          {/* Nickname */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nickname">Псевдоним</Label>
            <Input
              id="nickname"
              placeholder="Как обычно представляется"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>

          {/* Primary phone */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mobilePhone">Мобильный</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="mobilePhone"
                placeholder="+7 (999) 123-45-67"
                value={mobilePhone}
                onChange={(e) => setMobilePhone(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Extra phones */}
          {extraPhones.map((phone, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1 flex flex-col gap-1.5">
                <Label>Доп. телефон {index + 1}</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="+7 (999) 000-00-00"
                    value={phone}
                    onChange={(e) => updateExtraPhone(index, e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeExtraPhone(index)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {extraPhones.length < 3 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addExtraPhone}
              className="w-fit gap-1.5 bg-transparent"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить телефон
            </Button>
          )}

          {/* Organization */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="organization">Организация</Label>
            <Input
              id="organization"
              placeholder="ООО Компания"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
            />
          </div>

          {/* Comment */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comment">Комментарий</Label>
            <Textarea
              id="comment"
              placeholder="Заметки о контакте..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isSaving}
            className="bg-transparent"
          >
            Отмена
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !firstName.trim()}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
