'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  createCompanyInvite, 
  listCompanyInvites, 
  isPlatformAdmin, 
  deleteCompanyInvite,
  listAllCompanies,
  listCompanyEmployees,
  startViewAsSession,
} from '@/app/actions/platform'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Loader2, Plus, Copy, CheckCircle2, XCircle, AlertCircle, Trash2, Eye, Building2, Users } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Invite {
  id: string
  email: string
  company_name: string
  token: string
  expires_at: string
  used_at: string | null
  created_at: string
}

interface Company {
  id: string
  name: string
}

interface EmployeeWithUser {
  id: string
  full_name: string
  position: string | null
  user_id: string
}

export default function PlatformPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [generatedToken, setGeneratedToken] = useState('')
  const [error, setError] = useState('')

  // Delete invite state
  const [deletingToken, setDeletingToken] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // View-as state
  const [companies, setCompanies] = useState<Company[]>([])
  const [employees, setEmployees] = useState<EmployeeWithUser[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [loadingCompanies, setLoadingCompanies] = useState(false)
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [startingViewAs, setStartingViewAs] = useState(false)

  useEffect(() => {
    checkAdminAndLoadInvites()
    loadCompanies()
  }, [])

  // Load employees when company changes
  useEffect(() => {
    if (selectedCompanyId) {
      loadEmployees(selectedCompanyId)
    } else {
      setEmployees([])
      setSelectedEmployeeId('')
    }
  }, [selectedCompanyId])

  const checkAdminAndLoadInvites = async () => {
    setLoading(true)
    try {
      const adminStatus = await isPlatformAdmin()
      setIsAdmin(adminStatus)

      if (!adminStatus) {
        router.push('/')
        return
      }

      const result = await listCompanyInvites()
      if (result.error) {
        setError(result.error)
      } else if (result.invites) {
        setInvites(result.invites)
      }
    } catch (err) {
      console.error('[v0] Platform page error:', err)
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const loadCompanies = async () => {
    setLoadingCompanies(true)
    try {
      const result = await listAllCompanies()
      if (result.companies) {
        setCompanies(result.companies)
      }
    } catch (err) {
      console.error('[v0] Failed to load companies:', err)
    } finally {
      setLoadingCompanies(false)
    }
  }

  const loadEmployees = async (companyId: string) => {
    setLoadingEmployees(true)
    setSelectedEmployeeId('')
    try {
      const result = await listCompanyEmployees(companyId)
      if (result.employees) {
        setEmployees(result.employees)
      } else {
        setEmployees([])
      }
    } catch (err) {
      console.error('[v0] Failed to load employees:', err)
      setEmployees([])
    } finally {
      setLoadingEmployees(false)
    }
  }

  const handleStartViewAs = async () => {
    if (!selectedCompanyId || !selectedEmployeeId) {
      toast.error('Выберите компанию и сотрудника')
      return
    }

    setStartingViewAs(true)
    try {
      const result = await startViewAsSession(selectedCompanyId, selectedEmployeeId)
      if (result.success) {
        toast.success('Режим просмотра активирован')
        // Navigate to home page in view-as mode
        router.push('/')
      } else {
        toast.error(result.error || 'Ошибка активации режима просмотра')
      }
    } catch (err) {
      console.error('[v0] startViewAsSession error:', err)
      toast.error('Ошибка активации режима просмотра')
    } finally {
      setStartingViewAs(false)
    }
  }

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setGeneratedToken('')

    if (!companyName) {
      setError('Введите название компании')
      return
    }

    setCreating(true)
    try {
      const result = await createCompanyInvite(email, companyName)
      
      if (result.error) {
        setError(result.error)
        return
      }

      if (result.token) {
        setGeneratedToken(result.token)
        setEmail('')
        setCompanyName('')
        toast.success('Приглашение создано!')
        
        // Reload invites list
        const listResult = await listCompanyInvites()
        if (listResult.invites) {
          setInvites(listResult.invites)
        }
      }
    } catch (err) {
      setError('Ошибка создания приглашения')
      console.error('[v0] Create invite error:', err)
    } finally {
      setCreating(false)
    }
  }

  const copyInviteLink = (token: string) => {
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    const link = `${base}/onboarding?type=company&token=${token}`
    navigator.clipboard.writeText(link)
    toast.success('Ссылка скопирована!')
  }

  const handleDeleteInvite = async () => {
    if (!deletingToken) return
    setIsDeleting(true)
    try {
      const result = await deleteCompanyInvite(deletingToken)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Приглашение удалено')
      if (deletingToken === generatedToken) setGeneratedToken('')
      const listResult = await listCompanyInvites()
      if (listResult.invites) setInvites(listResult.invites)
    } catch (err) {
      toast.error('Ошибка удаления')
      console.error('[v0] deleteInvite error:', err)
    } finally {
      setIsDeleting(false)
      setDeletingToken(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Platform Admin
        </h1>
        <p className="text-muted-foreground">
          Управление приглашениями компаний
        </p>
      </div>

      {/* View-As Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Просмотр компаний
          </CardTitle>
          <CardDescription>
            Просмотр приложения от имени сотрудника (только чтение)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Company Select */}
            <div className="space-y-2">
              <Label htmlFor="view-company" className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Компания
              </Label>
              <Select
                value={selectedCompanyId}
                onValueChange={setSelectedCompanyId}
                disabled={loadingCompanies}
              >
                <SelectTrigger id="view-company">
                  <SelectValue placeholder={loadingCompanies ? 'Загрузка...' : 'Выберите компанию'} />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Employee Select */}
            <div className="space-y-2">
              <Label htmlFor="view-employee" className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Сотрудник
              </Label>
              <Select
                value={selectedEmployeeId}
                onValueChange={setSelectedEmployeeId}
                disabled={!selectedCompanyId || loadingEmployees}
              >
                <SelectTrigger id="view-employee">
                  <SelectValue 
                    placeholder={
                      !selectedCompanyId 
                        ? 'Сначала выберите компанию' 
                        : loadingEmployees 
                          ? 'Загрузка...' 
                          : employees.length === 0 
                            ? 'Нет сотрудников' 
                            : 'Выберите сотрудника'
                    } 
                  />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      <div className="flex flex-col">
                        <span>{emp.full_name}</span>
                        {emp.position && (
                          <span className="text-xs text-muted-foreground">{emp.position}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex items-end gap-2">
              <Button
                onClick={handleStartViewAs}
                disabled={!selectedCompanyId || !selectedEmployeeId || startingViewAs}
                className="flex-1"
              >
                {startingViewAs ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Открытие...
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    Открыть просмотр
                  </>
                )}
              </Button>
            </div>
          </div>

          {selectedCompanyId && selectedEmployeeId && (
            <Alert className="mt-4 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                В режиме просмотра все изменения запрещены. Вы увидите приложение так, как его видит выбранный сотрудник.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Separator className="my-6" />

      <h2 className="text-xl font-semibold mb-4">Управление приглашениями</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Create Invite Form (token + link) */}
        <Card>
          <CardHeader>
            <CardTitle>Создать приглашение</CardTitle>
            <CardDescription>
              Создайте ссылку-приглашение и отправьте её в мессенджере
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateInvite} className="flex flex-col gap-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {generatedToken && (
                <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-3">
                  <p className="text-sm font-semibold text-foreground">Приглашение создано!</p>
                  <p className="text-xs text-muted-foreground">
                    Скопируйте ссылку и отправьте в мессенджере
                  </p>
                  <code className="block truncate rounded bg-muted px-2 py-1 text-xs font-mono">
                    {(() => {
                      const base = typeof window !== 'undefined'
                        ? (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin)
                        : ''
                      return `${base}/onboarding?type=company&token=${generatedToken}`
                    })()}
                  </code>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="flex-1 bg-transparent"
                      onClick={() => copyInviteLink(generatedToken)}
                    >
                      <Copy className="mr-2 h-3 w-3" />
                      Скопировать ссылку
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeletingToken(generatedToken)}
                    >
                      <Trash2 className="mr-2 h-3 w-3" />
                      Удалить
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">
                  Email <span className="text-muted-foreground">(необязательно)</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="boss@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={creating}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="companyName">Название компании</Label>
                <Input
                  id="companyName"
                  type="text"
                  placeholder="ООО 'Компания'"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={creating}
                />
              </div>

              <Button type="submit" disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Создание...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Создать приглашение
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Invites List */}
        <Card>
          <CardHeader>
            <CardTitle>Приглашения</CardTitle>
            <CardDescription>
              Список созданных приглашений
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Нет созданных приглашений
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {invite.company_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {invite.email}
                        </p>
                      </div>
                      {invite.used_at ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Использован
                        </Badge>
                      ) : (
                        <Badge className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Активен
                        </Badge>
                      )}
                    </div>

                    {!invite.used_at && (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs font-mono">
                          {invite.token}
                        </code>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => copyInviteLink(invite.token)}
                          title="Скопировать ссылку"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDeletingToken(invite.token)}
                          title="Удалить приглашение"
                          className="bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Создано: {new Date(invite.created_at).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Confirm delete dialog */}
      <AlertDialog open={!!deletingToken} onOpenChange={(open) => { if (!open) setDeletingToken(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить приглашение?</AlertDialogTitle>
            <AlertDialogDescription>
              Токен станет недействительным. Это действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteInvite}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
