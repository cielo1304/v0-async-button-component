'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AutoClient, AutoDeal, Contact } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { updateAutoClientContact } from '@/app/actions/auto'
import { 
  Loader2, User, Phone, Mail, MapPin, CreditCard, Car as CarIcon,
  Star, Ban, FileText, AlertTriangle, Pencil, Building2
} from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { toast } from 'sonner'

const CLIENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  BUYER: { label: 'Покупатель', color: 'bg-emerald-500/20 text-emerald-400' },
  SELLER: { label: 'Продавец', color: 'bg-blue-500/20 text-blue-400' },
  RENTER: { label: 'Арендатор', color: 'bg-amber-500/20 text-amber-400' },
  CONSIGNOR: { label: 'Комитент', color: 'bg-violet-500/20 text-violet-400' },
}

const DEAL_TYPE_LABELS: Record<string, string> = {
  CASH_SALE: 'Наличная продажа',
  COMMISSION_SALE: 'Комиссия',
  INSTALLMENT: 'Рассрочка',
  RENT: 'Аренда',
}

export default function AutoClientPage() {
  const params = useParams()
  const id = params.id as string
  const [client, setClient] = useState<AutoClient | null>(null)
  const [contact, setContact] = useState<Contact | null>(null)
  const [deals, setDeals] = useState<AutoDeal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  // Edit form state
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editOrganization, setEditOrganization] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function loadData() {
    try {
      // Load auto_client with linked contact
      const { data: clientData, error: clientError } = await supabase
        .from('auto_clients')
        .select('*, contact:contacts(*)')
        .eq('id', id)
        .single()

      if (clientError) throw clientError
      
      const { contact: contactData, ...autoClientData } = clientData as any
      setClient(autoClientData)
      setContact(contactData || null)

      // Load deals
      const { data: dealsData, error: dealsError } = await supabase
        .from('auto_deals')
        .select('*')
        .or(`buyer_id.eq.${id},seller_id.eq.${id}`)
        .order('created_at', { ascending: false })

      if (dealsError) throw dealsError
      setDeals(dealsData || [])
    } catch (error) {
      console.error('[v0] Error loading client:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  const openEditDialog = () => {
    setEditFirstName(contact?.first_name || client?.full_name?.split(' ')[0] || '')
    setEditLastName(contact?.last_name || client?.full_name?.split(' ').slice(1).join(' ') || '')
    setEditNickname(contact?.nickname || '')
    setEditPhone(contact?.mobile_phone || client?.phone || '')
    setEditEmail(client?.email || '')
    setEditOrganization(contact?.organization || '')
    setIsEditOpen(true)
  }

  const handleSaveContact = async () => {
    setIsSaving(true)
    try {
      const result = await updateAutoClientContact({
        autoClientId: id,
        first_name: editFirstName,
        last_name: editLastName,
        nickname: editNickname,
        mobile_phone: editPhone,
        email: editEmail,
        organization: editOrganization,
      })
      if (!result.success) {
        toast.error(result.error || 'Ошибка сохранения')
        return
      }
      toast.success('Контакт обновлен')
      setIsEditOpen(false)
      setIsLoading(true)
      await loadData()
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Клиент не найден</p>
      </div>
    )
  }

  const typeInfo = CLIENT_TYPE_LABELS[client.client_type] || { label: client.client_type, color: 'bg-secondary' }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/cars">
                <Button variant="ghost" size="sm">{'← К списку'}</Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${client.is_blacklisted ? 'bg-red-500/20' : 'bg-zinc-800'}`}>
                  {client.is_blacklisted ? (
                    <Ban className="h-5 w-5 text-red-400" />
                  ) : (
                    <User className="h-5 w-5 text-zinc-100" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-foreground">
                      {contact?.display_name || client.full_name}
                    </h1>
                    <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openEditDialog}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {contact?.organization && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                      <Building2 className="h-3.5 w-3.5" />
                      {contact.organization}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${i < client.rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Основная информация */}
          <div className="lg:col-span-2 space-y-6">
            {/* Черный список */}
            {client.is_blacklisted && (
              <Card className="border-red-500/50 bg-red-500/10">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                    <div>
                      <p className="font-medium text-red-400">Клиент в черном списке</p>
                      {client.blacklist_reason && (
                        <p className="text-sm text-red-400/80">{client.blacklist_reason}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Контакты -- reads from linked contact first, fallback to auto_clients */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Контактная информация</CardTitle>
                  <Button variant="ghost" size="sm" onClick={openEditDialog} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />
                    Изменить
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {(contact?.mobile_phone || client.phone) && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <a href={`tel:${contact?.mobile_phone || client.phone}`} className="text-foreground hover:text-primary">
                      {contact?.mobile_phone || client.phone}
                    </a>
                  </div>
                )}
                {contact?.extra_phones?.map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-muted-foreground opacity-50" />
                    <a href={`tel:${p}`} className="text-foreground hover:text-primary">{p}</a>
                  </div>
                ))}
                {client.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <a href={`mailto:${client.email}`} className="text-foreground hover:text-primary">
                      {client.email}
                    </a>
                  </div>
                )}
                {client.address && (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    <span className="text-foreground">{client.address}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Паспортные данные */}
            {(client.passport_series || client.passport_number) && (
              <Card>
                <CardHeader>
                  <CardTitle>Паспортные данные</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <span className="font-mono">
                      {client.passport_series} {client.passport_number}
                    </span>
                  </div>
                  {client.passport_issued_by && (
                    <p className="text-sm text-muted-foreground ml-8">{client.passport_issued_by}</p>
                  )}
                  {client.passport_issued_date && (
                    <p className="text-sm text-muted-foreground ml-8">
                      Выдан: {format(new Date(client.passport_issued_date), 'd MMMM yyyy', { locale: ru })}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Водительское удостоверение */}
            {client.driver_license && (
              <Card>
                <CardHeader>
                  <CardTitle>Водительское удостоверение</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <CarIcon className="h-5 w-5 text-muted-foreground" />
                    <span className="font-mono">{client.driver_license}</span>
                  </div>
                  {client.driver_license_date && (
                    <p className="text-sm text-muted-foreground ml-8">
                      Выдано: {format(new Date(client.driver_license_date), 'd MMMM yyyy', { locale: ru })}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Примечание */}
            {client.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Примечание</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Сделки */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Сделки ({deals.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {deals.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Сделок пока нет</p>
                ) : (
                  <div className="space-y-3">
                    {deals.map((deal) => (
                      <Link
                        key={deal.id}
                        href={`/cars/deals/${deal.id}`}
                        className="block p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm">{deal.deal_number}</span>
                          <Badge variant="outline">{DEAL_TYPE_LABELS[deal.deal_type]}</Badge>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(deal.contract_date), 'd MMM yyyy', { locale: ru })}
                          </span>
                          {deal.sale_price && (
                            <span className="font-mono text-sm">
                              {Number(deal.sale_price).toLocaleString()} {deal.sale_currency}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Даты */}
            <Card className="mt-6">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Добавлен</span>
                  <span>{format(new Date(client.created_at), 'd MMM yyyy', { locale: ru })}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Обновлен</span>
                  <span>{format(new Date(client.updated_at), 'd MMM yyyy', { locale: ru })}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Edit Contact Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать контакт</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editFirstName">Имя</Label>
                <Input id="editFirstName" value={editFirstName} onChange={e => setEditFirstName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editLastName">Фамилия</Label>
                <Input id="editLastName" value={editLastName} onChange={e => setEditLastName(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editNickname">Псевдоним</Label>
              <Input id="editNickname" value={editNickname} onChange={e => setEditNickname(e.target.value)} placeholder="Как обычно представляется" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editPhone">Мобильный телефон</Label>
              <Input id="editPhone" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+7 (999) 123-45-67" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editEmail">Email</Label>
              <Input id="editEmail" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editOrg">Организация</Label>
              <Input id="editOrg" value={editOrganization} onChange={e => setEditOrganization(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Отмена</Button>
            <Button onClick={handleSaveContact} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
