'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { acceptCompanyInvite } from '@/app/actions/tenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <OnboardingForm />
    </Suspense>
  )
}

function OnboardingForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const next = searchParams.get('next') || '/'

  const [token, setToken] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!token || !fullName) {
      setError('Пожалуйста, заполните все поля')
      return
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(token)) {
      setError('Неверный формат токена. Токен должен быть в формате UUID.')
      return
    }

    setLoading(true)
    try {
      const result = await acceptCompanyInvite(token, fullName)
      
      if (result.error) {
        setError(result.error)
        return
      }

      toast.success('Приглашение активировано! Добро пожаловать.')
      router.push(next)
      router.refresh()
    } catch (err) {
      setError('Произошла ошибка при активации приглашения')
      console.error('[v0] Activation error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            Активация аккаунта
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Введите токен приглашения и ваше имя для завершения регистрации
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleActivate} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="token">Токен приглашения</Label>
              <Input
                id="token"
                type="text"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={token}
                onChange={(e) => setToken(e.target.value.trim())}
                disabled={loading}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Токен должен быть в формате UUID (36 символов)
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName">Ваше полное имя</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Иван Иванов"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Активация...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Активировать
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
