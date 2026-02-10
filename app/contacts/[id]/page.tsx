'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Home, Users, Phone, Mail, ArrowLeft, Loader2, ArrowLeftRight, FileText, Car, Clock, Calendar, CreditCard, MapPin, Award as IdCard, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { 
  Contact, ContactChannel, ContactSegment, ContactSensitive,
  ContactModule, ClientExchangeOperation, Deal, AutoClient, AutoDeal
} from '@/lib/types/database'
import { MODULE_LABELS, MODULE_COLORS } from '@/lib/constants/contacts'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { getCurrentUserPermissions, canReadModule, canReadSensitive } from '@/lib/access'

interface ContactFull extends Contact {
  contact_channels: ContactChannel[]
  contact_segments: ContactSegment[]
}

const MODULE_ICONS: Record<ContactModule, typeof ArrowLeftRight> = {
  exchange: ArrowLeftRight,
  deals: FileText,
  auto: Car,
}

export default function ContactDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const supabase = useMemo(() => createClient(), [])

  const [contact, setContact] = useState<ContactFull | null>(null)
  const [sensitive, setSensitive] = useState<ContactSensitive | null>(null)
  const [exchangeOps, setExchangeOps] = useState<ClientExchangeOperation[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [financeDeals, setFinanceDeals] = useState<Array<{ id: string; title: string; status: string; principal_amount: number; contract_currency: string; created_at: string }>>([])
  const [autoClients, setAutoClients] = useState<AutoClient[]>([])
  const [autoDeals, setAutoDeals] = useState<AutoDeal[]>([])

  
  const [isLoading, setIsLoading] = useState(true)
  const [permissions, setPermissions] = useState<Set<string>>(new Set(['*']))
  const [activeTab, setActiveTab] = useState('exchange')

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    setIsLoading(true)
    try {
      // Загружаем права
      const perms = await getCurrentUserPermissions(supabase)
      setPermissions(perms)

      // Загружаем контакт
      const { data: contactData, error } = await supabase
        .from('contacts')
        .select(`
          *,
          contact_channels (*),
          contact_segments (*)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setContact(contactData)

      // Загружаем чувствительные данные если есть доступ
      if (canReadSensitive(perms)) {
        const { data: sensitiveData } = await supabase
          .from('contact_sensitive')
          .select('*')
          .eq('contact_id', id)
          .single()
        setSensitive(sensitiveData)
      }

      // Загружаем данные по модулям если есть доступ
      if (canReadModule(perms, 'exchange')) {
        const { data } = await supabase
          .from('client_exchange_operations')
          .select('*')
          .eq('contact_id', id)
          .order('created_at', { ascending: false })
        setExchangeOps(data || [])
      }

      if (canReadModule(perms, 'deals')) {
        const { data } = await supabase
          .from('deals')
          .select('*')
          .eq('contact_id', id)
          .order('created_at', { ascending: false })
        setDeals(data || [])
      }

      // Загружаем финансовые сделки
      {
        const { data: finData } = await supabase
          .from('core_deals')
          .select('id, title, status, created_at, finance_deals(principal_amount, contract_currency)')
          .eq('kind', 'finance')
          .eq('contact_id', id)
          .order('created_at', { ascending: false })
        setFinanceDeals((finData || []).map((d: any) => ({
          id: d.id,
          title: d.title,
          status: d.status,
          principal_amount: d.finance_deals?.[0]?.principal_amount || d.finance_deals?.principal_amount || 0,
          contract_currency: d.finance_deals?.[0]?.contract_currency || d.finance_deals?.contract_currency || 'USD',
          created_at: d.created_at,
        })))
      }

      if (canReadModule(perms, 'auto')) {
        const [clientsRes, dealsRes] = await Promise.all([
          supabase.from('auto_clients').select('*').eq('contact_id', id),
          supabase.from('auto_deals').select('*')
            .or(`buyer_contact_id.eq.${id},seller_contact_id.eq.${id}`)
            .order('created_at', { ascending: false })
        ])
        setAutoClients(clientsRes.data || [])
        setAutoDeals(dealsRes.data || [])
      }

    } catch (error) {
      console.error('[v0] Error loading contact:', error)
      router.push('/contacts')
    } finally {
      setIsLoading(false)
    }
  }

  const getPrimaryPhone = (channels: ContactChannel[]) => {
    const primary = channels.find(ch => ch.type === 'phone' && ch.is_primary)
    return primary?.value || channels.find(ch => ch.type === 'phone')?.value || null
  }

  const getPrimaryEmail = (channels: ContactChannel[]) => {
    const primary = channels.find(ch => ch.type === 'email' && ch.is_primary)
    return primary?.value || channels.find(ch => ch.type === 'email')?.value || null
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Контакт не найден</p>
      </div>
    )
  }

  const phone = getPrimaryPhone(contact.contact_channels)
  const email = getPrimaryEmail(contact.contact_channels)

  // Определяем доступные вкладки (без таймлайна, только модульные)
  const availableTabs = [
    { id: 'exchange', label: 'Обмен', icon: ArrowLeftRight, module: 'exchange' as ContactModule },
    { id: 'deals', label: 'Сделки', icon: FileText, module: 'deals' as ContactModule },
    { id: 'finance', label: 'Финансовые сделки', icon: Landmark, always: true },
    { id: 'auto', label: 'Автоплощадка', icon: Car, module: 'auto' as ContactModule },
  ].filter(tab => tab.always || (tab.module && canReadModule(permissions, tab.module)))

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/contacts')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {contact.display_name}
              </h1>
              <div className="flex items-center gap-4 mt-1">
                {phone && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {phone}
                  </span>
                )}
                {email && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {email}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {contact.contact_segments.map((segment) => {
                const Icon = MODULE_ICONS[segment.module]
                return (
                  <Badge 
                    key={segment.id}
                    variant="secondary"
                    className={MODULE_COLORS[segment.module]}
                  >
                    <Icon className="h-3 w-3 mr-1" />
                    {MODULE_LABELS[segment.module]}
                  </Badge>
                )
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-6">
        {/* Sensitive Data Card */}
        {sensitive && canReadSensitive(permissions) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <IdCard className="h-4 w-4" />
                Персональные данные
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {(sensitive.passport_series || sensitive.passport_number) && (
                  <div>
                    <div className="text-muted-foreground">Паспорт</div>
                    <div>{sensitive.passport_series} {sensitive.passport_number}</div>
                  </div>
                )}
                {sensitive.passport_issued_by && (
                  <div>
                    <div className="text-muted-foreground">Выдан</div>
                    <div>{sensitive.passport_issued_by}</div>
                  </div>
                )}
                {sensitive.address && (
                  <div className="col-span-2">
                    <div className="text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Адрес
                    </div>
                    <div>{sensitive.address}</div>
                  </div>
                )}
                {sensitive.driver_license && (
                  <div>
                    <div className="text-muted-foreground">ВУ</div>
                    <div>{sensitive.driver_license}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {availableTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Exchange Tab */}
          {canReadModule(permissions, 'exchange') && (
            <TabsContent value="exchange">
              <Card>
                <CardHeader>
                  <CardTitle>Операции обмена</CardTitle>
                </CardHeader>
                <CardContent>
                  {exchangeOps.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">Нет операций обмена</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Номер</TableHead>
                          <TableHead>Дата</TableHead>
                          <TableHead>Отдал клиент</TableHead>
                          <TableHead>Получил клиент</TableHead>
                          <TableHead>Прибыль</TableHead>
                          <TableHead>Статус</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exchangeOps.map((op) => (
                          <TableRow key={op.id}>
                            <TableCell className="font-mono">{op.operation_number}</TableCell>
                            <TableCell>
                              {format(new Date(op.created_at), 'd MMM yyyy', { locale: ru })}
                            </TableCell>
                            <TableCell>${op.total_client_gives_usd.toFixed(2)}</TableCell>
                            <TableCell>${op.total_client_receives_usd.toFixed(2)}</TableCell>
                            <TableCell className="text-emerald-400">
                              +{op.profit_amount.toFixed(2)} {op.profit_currency}
                            </TableCell>
                            <TableCell>
                              <Badge variant={op.status === 'completed' ? 'default' : 'secondary'}>
                                {op.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Deals Tab */}
          {canReadModule(permissions, 'deals') && (
            <TabsContent value="deals">
              <Card>
                <CardHeader>
                  <CardTitle>Сделки</CardTitle>
                </CardHeader>
                <CardContent>
                  {deals.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">Нет сделок</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Номер</TableHead>
                          <TableHead>Дата</TableHead>
                          <TableHead>Сумма</TableHead>
                          <TableHead>Оплачено</TableHead>
                          <TableHead>Статус</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deals.map((deal) => (
                          <TableRow 
                            key={deal.id}
                            className="cursor-pointer hover:bg-accent/50"
                            onClick={() => router.push(`/deals/${deal.id}`)}
                          >
                            <TableCell className="font-mono">{deal.deal_number}</TableCell>
                            <TableCell>
                              {format(new Date(deal.created_at), 'd MMM yyyy', { locale: ru })}
                            </TableCell>
                            <TableCell>
                              {deal.total_amount.toLocaleString()} {deal.total_currency}
                            </TableCell>
                            <TableCell>
                              ${deal.paid_amount_usd.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={deal.status === 'COMPLETED' ? 'default' : 'secondary'}>
                                {deal.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Finance Deals Tab */}
          <TabsContent value="finance">
            <Card>
              <CardHeader>
                <CardTitle>Финансовые сделки</CardTitle>
              </CardHeader>
              <CardContent>
                {financeDeals.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Нет финансовых сделок</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Название</TableHead>
                        <TableHead>Дата</TableHead>
                        <TableHead>Сумма</TableHead>
                        <TableHead>Статус</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financeDeals.map((deal) => (
                        <TableRow 
                          key={deal.id}
                          className="cursor-pointer hover:bg-accent/50"
                          onClick={() => router.push(`/finance-deals/${deal.id}`)}
                        >
                          <TableCell className="font-medium">{deal.title}</TableCell>
                          <TableCell>
                            {format(new Date(deal.created_at), 'd MMM yyyy', { locale: ru })}
                          </TableCell>
                          <TableCell>
                            {deal.principal_amount?.toLocaleString() || '-'} {deal.contract_currency}
                          </TableCell>
                          <TableCell>
                            <Badge variant={deal.status === 'CLOSED' ? 'default' : 'secondary'}>
                              {deal.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Auto Tab */}
          {canReadModule(permissions, 'auto') && (
            <TabsContent value="auto">
              <div className="space-y-6">
                {/* Auto Clients */}
                {autoClients.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Профиль автоплощадки</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {autoClients.map((client) => (
                        <div 
                          key={client.id} 
                          className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-accent/50"
                          onClick={() => router.push(`/cars/clients/${client.id}`)}
                        >
                          <div>
                            <div className="font-medium">{client.full_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {client.client_type} • Рейтинг: {client.rating}/5
                            </div>
                          </div>
                          {client.is_blacklisted && (
                            <Badge variant="destructive">Черный список</Badge>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Auto Deals */}
                <Card>
                  <CardHeader>
                    <CardTitle>Авто-сделки</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {autoDeals.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">Нет авто-сделок</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Номер</TableHead>
                            <TableHead>Тип</TableHead>
                            <TableHead>Дата</TableHead>
                            <TableHead>Сумма</TableHead>
                            <TableHead>Статус</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {autoDeals.map((deal) => (
                            <TableRow 
                              key={deal.id}
                              className="cursor-pointer hover:bg-accent/50"
                              onClick={() => router.push(`/cars/deals/${deal.id}`)}
                            >
                              <TableCell className="font-mono">{deal.deal_number}</TableCell>
                              <TableCell>{deal.deal_type}</TableCell>
                              <TableCell>
                                {format(new Date(deal.created_at), 'd MMM yyyy', { locale: ru })}
                              </TableCell>
                              <TableCell>
                                {deal.sale_price?.toLocaleString() || '-'} {deal.sale_currency}
                              </TableCell>
                              <TableCell>
                                <Badge variant={deal.status === 'COMPLETED' ? 'default' : 'secondary'}>
                                  {deal.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  )
}
