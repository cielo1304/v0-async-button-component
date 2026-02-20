'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createCompanyInvite, listCompanyInvites, isPlatformAdmin } from '@/app/actions/platform'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Plus, Copy, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

interface Invite {
  id: string
  email: string
  company_name: string
  token: string
  expires_at: string
  used_at: string | null
  created_at: string
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

  useEffect(() => {
    checkAdminAndLoadInvites()
  }, [])

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

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setGeneratedToken('')

    if (!email || !companyName) {
      setError('Заполните все поля')
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

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token)
    toast.success('Токен скопирован!')
  }

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/onboarding?token=${token}`
    navigator.clipboard.writeText(link)
    toast.success('Ссылка скопирована!')
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Create Invite Form */}
        <Card>
          <CardHeader>
            <CardTitle>Создать приглашение</CardTitle>
            <CardDescription>
              Создайте новое приглашение для регистрации компании
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
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <div className="flex flex-col gap-2">
                      <p className="font-semibold">Приглашение создано!</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-muted px-2 py-1 text-xs font-mono">
                          {generatedToken}
                        </code>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => copyToken(generatedToken)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => copyInviteLink(generatedToken)}
                      >
                        <Copy className="mr-2 h-3 w-3" />
                        Копировать ссылку
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
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
                        >
                          <Copy className="h-3 w-3" />
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
    </div>
  )
}
