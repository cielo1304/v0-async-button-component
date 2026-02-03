'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AsyncButton } from '@/components/ui/async-button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserPlus, Star } from 'lucide-react'

const CLIENT_TYPES = [
  { value: 'BUYER', label: 'Покупатель' },
  { value: 'SELLER', label: 'Продавец' },
  { value: 'RENTER', label: 'Арендатор' },
  { value: 'CONSIGNOR', label: 'Комитент' },
]

export function AddAutoClientDialog() {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Основные данные
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [clientType, setClientType] = useState('BUYER')
  const [rating, setRating] = useState(5)

  // Паспорт
  const [passportSeries, setPassportSeries] = useState('')
  const [passportNumber, setPassportNumber] = useState('')
  const [passportIssuedBy, setPassportIssuedBy] = useState('')
  const [passportIssuedDate, setPassportIssuedDate] = useState('')
  const [address, setAddress] = useState('')

  // Водительское
  const [driverLicense, setDriverLicense] = useState('')
  const [driverLicenseDate, setDriverLicenseDate] = useState('')

  // Примечание
  const [notes, setNotes] = useState('')

  const resetForm = () => {
    setFullName('')
    setPhone('')
    setEmail('')
    setClientType('BUYER')
    setRating(5)
    setPassportSeries('')
    setPassportNumber('')
    setPassportIssuedBy('')
    setPassportIssuedDate('')
    setAddress('')
    setDriverLicense('')
    setDriverLicenseDate('')
    setNotes('')
  }

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast.error('Введите ФИО клиента')
      return
    }

    setIsLoading(true)

    try {
      const { error } = await supabase.from('auto_clients').insert({
        full_name: fullName.trim(),
        phone: phone || null,
        email: email || null,
        client_type: clientType,
        rating,
        passport_series: passportSeries || null,
        passport_number: passportNumber || null,
        passport_issued_by: passportIssuedBy || null,
        passport_issued_date: passportIssuedDate || null,
        address: address || null,
        driver_license: driverLicense || null,
        driver_license_date: driverLicenseDate || null,
        notes: notes || null,
      })

      if (error) throw error

      toast.success('Клиент добавлен')
      resetForm()
      setOpen(false)
      router.refresh()
    } catch (error) {
      console.error('[v0] Error creating auto client:', error)
      toast.error('Ошибка при создании клиента')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Добавить клиента
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новый клиент</DialogTitle>
          <DialogDescription>Добавьте нового клиента автоплощадки</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Основная информация */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Основная информация</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="fullName">ФИО *</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Иванов Иван Иванович"
                />
              </div>
              <div>
                <Label htmlFor="phone">Телефон</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 (999) 123-45-67"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@email.com"
                />
              </div>
              <div>
                <Label>Тип клиента</Label>
                <Select value={clientType} onValueChange={setClientType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Рейтинг</Label>
                <div className="flex items-center gap-1 mt-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1"
                    >
                      <Star
                        className={`h-5 w-5 transition-colors ${
                          star <= rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Паспортные данные */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Паспортные данные</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="passportSeries">Серия</Label>
                <Input
                  id="passportSeries"
                  value={passportSeries}
                  onChange={(e) => setPassportSeries(e.target.value)}
                  placeholder="12 34"
                  maxLength={10}
                />
              </div>
              <div>
                <Label htmlFor="passportNumber">Номер</Label>
                <Input
                  id="passportNumber"
                  value={passportNumber}
                  onChange={(e) => setPassportNumber(e.target.value)}
                  placeholder="567890"
                  maxLength={20}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="passportIssuedBy">Кем выдан</Label>
                <Input
                  id="passportIssuedBy"
                  value={passportIssuedBy}
                  onChange={(e) => setPassportIssuedBy(e.target.value)}
                  placeholder="ГУ МВД России по г. Москве"
                />
              </div>
              <div>
                <Label htmlFor="passportIssuedDate">Дата выдачи</Label>
                <Input
                  id="passportIssuedDate"
                  type="date"
                  value={passportIssuedDate}
                  onChange={(e) => setPassportIssuedDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="address">Адрес</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="г. Москва, ул. Примерная, д. 1"
                />
              </div>
            </div>
          </div>

          {/* Водительское удостоверение */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Водительское удостоверение</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="driverLicense">Номер ВУ</Label>
                <Input
                  id="driverLicense"
                  value={driverLicense}
                  onChange={(e) => setDriverLicense(e.target.value)}
                  placeholder="12 34 567890"
                />
              </div>
              <div>
                <Label htmlFor="driverLicenseDate">Дата выдачи</Label>
                <Input
                  id="driverLicenseDate"
                  type="date"
                  value={driverLicenseDate}
                  onChange={(e) => setDriverLicenseDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Примечание */}
          <div>
            <Label htmlFor="notes">Примечание</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Дополнительная информация о клиенте..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <AsyncButton onClick={handleSubmit} isLoading={isLoading}>
            Добавить клиента
          </AsyncButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
