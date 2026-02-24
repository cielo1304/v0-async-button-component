'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, KeyRound, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function SetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <SetPasswordForm />
    </Suspense>
  )
}

function SetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const next = searchParams.get('next') || '/'

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [noSession, setNoSession] = useState(false)

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов')
      return
    }
    if (password !== confirm) {
      setError('Пароли не совпадают')
      return
    }

    setLoading(true)
    try {
      // Verify we have a session first
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setNoSession(true)
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }

      // Redirect to next destination (onboarding, home, etc.)
      router.push(next)
      router.refresh()
    } catch (err) {
      setError('Произошла ошибка. Попробуйте ещё раз.')
      console.error('[v0] set-password error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (noSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-xl font-bold text-foreground">
              Ссылка недействительна
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Пожалуйста, откройте ссылку из письма ещё раз. Ссылки действительны 24 часа и могут использоваться только один раз.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Link href="/login">
              <Button variant="outline">Перейти к входу</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            Установите пароль
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Придумайте пароль для вашего аккаунта
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Новый пароль</Label>
              <Input
                id="password"
                type="password"
                placeholder="Минимум 8 символов"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm">Повторите пароль</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="Повторите пароль"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Сохранение...
                </>
              ) : (
                'Сохранить пароль и продолжить'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
