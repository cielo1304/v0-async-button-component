'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  Users, Search, Home, Phone, Mail, Filter, 
  ArrowLeftRight, FileText, Car, Loader2, ChevronRight 
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Contact, ContactSegment, ContactChannel, ContactModule } from '@/lib/types/database'
import { MODULE_LABELS, MODULE_COLORS } from '@/lib/constants/contacts'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

interface ContactWithDetails extends Contact {
  contact_channels: ContactChannel[]
  contact_segments: ContactSegment[]
}

const MODULE_ICONS: Record<ContactModule, typeof ArrowLeftRight> = {
  exchange: ArrowLeftRight,
  deals: FileText,
  auto: Car,
}

export default function ContactsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  
  const [contacts, setContacts] = useState<ContactWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState<ContactModule | 'all'>('all')

  useEffect(() => {
    loadContacts()
  }, [])

  async function loadContacts() {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          contact_channels (*),
          contact_segments (*)
        `)
        .order('updated_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setContacts(data || [])
    } catch (error) {
      console.error('[v0] Error loading contacts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      // Фильтр по поиску
      const searchLower = searchQuery.toLowerCase()
      const matchesSearch = !searchQuery || 
        contact.display_name.toLowerCase().includes(searchLower) ||
        contact.contact_channels.some(ch => 
          ch.value.toLowerCase().includes(searchLower) ||
          ch.normalized.includes(searchQuery.replace(/\D/g, ''))
        )

      // Фильтр по модулю
      const matchesModule = moduleFilter === 'all' || 
        contact.contact_segments.some(seg => seg.module === moduleFilter)

      return matchesSearch && matchesModule
    })
  }, [contacts, searchQuery, moduleFilter])

  const getPrimaryPhone = (channels: ContactChannel[]) => {
    const primary = channels.find(ch => ch.type === 'phone' && ch.is_primary)
    return primary?.value || channels.find(ch => ch.type === 'phone')?.value || null
  }

  const getPrimaryEmail = (channels: ContactChannel[]) => {
    const primary = channels.find(ch => ch.type === 'email' && ch.is_primary)
    return primary?.value || channels.find(ch => ch.type === 'email')?.value || null
  }

  const getLastActivity = (segments: ContactSegment[]) => {
    const dates = segments
      .filter(s => s.last_activity_at)
      .map(s => new Date(s.last_activity_at!).getTime())
    
    if (dates.length === 0) return null
    return new Date(Math.max(...dates))
  }

  const stats = useMemo(() => ({
    total: contacts.length,
    exchange: contacts.filter(c => c.contact_segments.some(s => s.module === 'exchange')).length,
    deals: contacts.filter(c => c.contact_segments.some(s => s.module === 'deals')).length,
    auto: contacts.filter(c => c.contact_segments.some(s => s.module === 'auto')).length,
  }), [contacts])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <Home className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  <Users className="h-6 w-6" />
                  Контакты
                </h1>
                <p className="text-sm text-muted-foreground">
                  Единая база клиентов для всех направлений
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Всего контактов</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setModuleFilter(moduleFilter === 'exchange' ? 'all' : 'exchange')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-amber-400" />
                <div className="text-2xl font-bold">{stats.exchange}</div>
              </div>
              <div className="text-sm text-muted-foreground">Обмен валют</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setModuleFilter(moduleFilter === 'deals' ? 'all' : 'deals')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-400" />
                <div className="text-2xl font-bold">{stats.deals}</div>
              </div>
              <div className="text-sm text-muted-foreground">Сделки</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setModuleFilter(moduleFilter === 'auto' ? 'all' : 'auto')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-emerald-400" />
                <div className="text-2xl font-bold">{stats.auto}</div>
              </div>
              <div className="text-sm text-muted-foreground">Автоплощадка</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по имени или телефону..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 bg-transparent">
                    <Filter className="h-4 w-4" />
                    {moduleFilter === 'all' ? 'Все модули' : MODULE_LABELS[moduleFilter]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setModuleFilter('all')}>
                    Все модули
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setModuleFilter('exchange')}>
                    <ArrowLeftRight className="h-4 w-4 mr-2 text-amber-400" />
                    Обмен валют
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setModuleFilter('deals')}>
                    <FileText className="h-4 w-4 mr-2 text-blue-400" />
                    Сделки
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setModuleFilter('auto')}>
                    <Car className="h-4 w-4 mr-2 text-emerald-400" />
                    Автоплощадка
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Контакты ({filteredContacts.length})
              {moduleFilter !== 'all' && (
                <Badge variant="secondary" className="ml-2">
                  {MODULE_LABELS[moduleFilter]}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery || moduleFilter !== 'all' ? 'Контакты не найдены' : 'Нет контактов'}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Имя</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Сегменты</TableHead>
                    <TableHead>Последняя активность</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.map((contact) => {
                    const phone = getPrimaryPhone(contact.contact_channels)
                    const email = getPrimaryEmail(contact.contact_channels)
                    const lastActivity = getLastActivity(contact.contact_segments)

                    return (
                      <TableRow 
                        key={contact.id} 
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => router.push(`/contacts/${contact.id}`)}
                      >
                        <TableCell className="font-medium">
                          {contact.display_name}
                        </TableCell>
                        <TableCell>
                          {phone && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {phone}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {email && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {email}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
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
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {lastActivity ? format(lastActivity, 'd MMM yyyy', { locale: ru }) : '-'}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
