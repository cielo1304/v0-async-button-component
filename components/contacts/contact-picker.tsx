'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import {
  Search,
  X,
  Plus,
  Phone,
  Trash2,
  Loader2,
  User,
  Building2,
  ChevronsUpDown,
  Check,
} from 'lucide-react'
import { searchContacts, createContact, type CreateContactPayload } from '@/app/actions/contacts'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ----- Public types -----

export interface ContactPickerValue {
  id: string
  display_name: string
  nickname?: string | null
  phones: string[]
  organization?: string | null
}

export interface ContactPickerProps {
  label?: string
  value: string | null
  onChange: (id: string | null, contact: ContactPickerValue | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** If true the component also shows inline "create" in empty state */
  allowCreate?: boolean
}

// ----- Component -----

export function ContactPicker({
  label,
  value,
  onChange,
  placeholder = 'Выберите контакт...',
  disabled = false,
  className,
  allowCreate = true,
}: ContactPickerProps) {
  // --- popover state ---
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactPickerValue[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedContact, setSelectedContact] = useState<ContactPickerValue | null>(null)

  // --- create dialog ---
  const [showCreate, setShowCreate] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load selected contact info when value changes externally
  useEffect(() => {
    if (!value) {
      setSelectedContact(null)
      return
    }
    // Only refetch if we don't already have this contact cached
    if (selectedContact?.id === value) return

    let cancelled = false
    searchContacts('', 200).then(all => {
      if (cancelled) return
      const found = all.find(c => c.id === value)
      if (found) setSelectedContact(found)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // ------ search ------
  const doSearch = useCallback(async (q: string) => {
    setIsSearching(true)
    try {
      const data = await searchContacts(q, 15)
      setResults(data)
    } catch {
      // silent
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleQueryChange = useCallback(
    (q: string) => {
      setQuery(q)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => doSearch(q), 250)
    },
    [doSearch],
  )

  // Load initial list when popover opens
  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (next) {
        setQuery('')
        doSearch('')
        // Focus input on next tick
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    },
    [doSearch],
  )

  // ------ select ------
  const handleSelect = useCallback(
    (contact: ContactPickerValue) => {
      setSelectedContact(contact)
      onChange(contact.id, contact)
      setOpen(false)
    },
    [onChange],
  )

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setSelectedContact(null)
      onChange(null, null)
    },
    [onChange],
  )

  // ------ create inline ------
  const handleCreated = useCallback(
    (contact: ContactPickerValue) => {
      setSelectedContact(contact)
      onChange(contact.id, contact)
      setShowCreate(false)
      setOpen(false)
      toast.success(`Контакт "${contact.display_name}" создан и выбран`)
    },
    [onChange],
  )

  // ------ render helpers ------
  const renderContactLine = (c: ContactPickerValue, showCheck = false) => (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <User className="h-4 w-4" />
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-medium truncate text-foreground">{c.display_name}</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
          {c.phones.length > 0 && (
            <span className="flex items-center gap-0.5">
              <Phone className="h-3 w-3" />
              {c.phones[0]}
            </span>
          )}
          {c.organization && (
            <span className="flex items-center gap-0.5">
              <Building2 className="h-3 w-3" />
              {c.organization}
            </span>
          )}
        </div>
      </div>
      {showCheck && selectedContact?.id === c.id && (
        <Check className="h-4 w-4 shrink-0 text-accent" />
      )}
    </div>
  )

  return (
    <>
      <div className={cn('flex flex-col gap-1.5', className)}>
        {label && (
          <Label className="text-sm font-medium text-foreground">{label}</Label>
        )}

        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className={cn(
                'w-full justify-between h-auto min-h-10 px-3 py-2 bg-transparent font-normal',
                !selectedContact && 'text-muted-foreground',
              )}
            >
              {selectedContact ? (
                <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="text-sm font-medium truncate text-foreground">
                      {selectedContact.display_name}
                    </span>
                    {selectedContact.phones.length > 0 && (
                      <span className="text-xs text-muted-foreground truncate">
                        {selectedContact.phones[0]}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-sm p-0.5 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    onClick={handleClear}
                    aria-label="Очистить выбор"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <span className="truncate">{placeholder}</span>
              )}
              {!selectedContact && (
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              )}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
            sideOffset={4}
          >
            {/* Search input */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
                placeholder="Поиск по имени, телефону..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground"
              />
              {isSearching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {/* Results */}
            <div className="max-h-[260px] overflow-y-auto">
              {results.length === 0 && !isSearching && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {query ? 'Ничего не найдено' : 'Нет контактов'}
                </div>
              )}

              {results.map(contact => (
                <button
                  key={contact.id}
                  type="button"
                  className={cn(
                    'w-full px-3 py-2 text-left hover:bg-accent/10 transition-colors cursor-pointer',
                    selectedContact?.id === contact.id && 'bg-accent/10',
                  )}
                  onClick={() => handleSelect(contact)}
                >
                  {renderContactLine(contact, true)}
                </button>
              ))}
            </div>

            {/* Create button */}
            {allowCreate && (
              <div className="border-t border-border p-2">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => {
                    setShowCreate(true)
                    setOpen(false)
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Создать контакт
                  {query && (
                    <span className="ml-auto text-xs text-muted-foreground truncate max-w-[140px]">
                      {query}
                    </span>
                  )}
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Inline create dialog */}
      {showCreate && (
        <InlineCreateDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          onCreated={handleCreated}
          initialName={query}
        />
      )}
    </>
  )
}

// ======================================================
// Inline Create Dialog — reuses the same form pattern
// ======================================================

interface InlineCreateDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (contact: ContactPickerValue) => void
  initialName?: string
}

function InlineCreateDialog({ open, onOpenChange, onCreated, initialName = '' }: InlineCreateDialogProps) {
  const [firstName, setFirstName] = useState(initialName)
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

  const updateExtraPhone = (index: number, val: string) => {
    const u = [...extraPhones]
    u[index] = val
    setExtraPhones(u)
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

      onCreated({
        id: result.id,
        display_name: result.display_name,
        phones: result.phones,
        nickname: nickname.trim() || null,
        organization: organization.trim() || null,
      })

      resetForm()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка создания контакта')
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
              <Label htmlFor="cp-firstName">
                Имя <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cp-firstName"
                placeholder="Иван"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-lastName">Фамилия</Label>
              <Input
                id="cp-lastName"
                placeholder="Петров"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
              />
            </div>
          </div>

          {/* Nickname */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-nickname">Псевдоним</Label>
            <Input
              id="cp-nickname"
              placeholder="Как обычно представляется"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
            />
          </div>

          {/* Primary phone */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-mobilePhone">Мобильный</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="cp-mobilePhone"
                placeholder="+7 (999) 123-45-67"
                value={mobilePhone}
                onChange={e => setMobilePhone(e.target.value)}
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
                    onChange={e => updateExtraPhone(index, e.target.value)}
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
            <Label htmlFor="cp-organization">Организация</Label>
            <Input
              id="cp-organization"
              placeholder="ООО Компания"
              value={organization}
              onChange={e => setOrganization(e.target.value)}
            />
          </div>

          {/* Comment */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-comment">Комментарий</Label>
            <Textarea
              id="cp-comment"
              placeholder="Заметки о контакте..."
              value={comment}
              onChange={e => setComment(e.target.value)}
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
            Создать и выбрать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
