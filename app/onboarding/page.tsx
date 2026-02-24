'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { acceptCompanyInvite, acceptEmployeeInvite } from '@/app/actions/tenant'
import { createUserByInvite } from '@/app/actions/auth-admin'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react'

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

/** Client-side password validation matching server policy */
function validatePasswordClient(password: string): string | null {
  if (password.length < 8) return 'Пароль должен содержать минимум 8 символов'
  if (!/[A-Z]/.test(password)) return 'Пароль должен содержать хотя бы одну заглавную латинскую букву'
  if (!/[0-9]/.test(password)) return 'Пароль должен содержать хотя бы одну цифру'
  return null
}

type Step =
  | 'checking'       // checking session
  | 'activation'     // unauthenticated — show email+password form
  | 'invite'         // authenticated — show invite acceptance form

function OnboardingForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const next = searchParams.get('next') || '/'
  const urlToken = searchParams.get('token') || ''
  const inviteType = searchParams.get('type') || 'company'

  const [step, setStep] = useState<Step>('checking')

  // Activation form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordRepeat, setPasswordRepeat] = useState('')
  const [activationError, setActivationError] = useState('')
  const [activating, setActivating] = useState(false)

  // Invite acceptance state
  const [token, setToken] = useState(urlToken)
  const [fullName, setFullName] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [accepting, setAccepting] = useState(false)

  // On mount: check session and decide which step to show
  useEffect(() => {
    const checkAuth = async () => {
      if (!urlToken) {
        // No token — just show the invite form (it will show an empty token field)
        setStep('invite')
        return
      }
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          setStep('invite')
        } else {
          setStep('activation')
        }
      } catch {
        // Can't check — default to invite step
        setStep('invite')
      }
    }
    checkAuth()
  }, [urlToken])

  /** Step 1: Sign in (or create account) and then advance to invite step */
  const handleActivation = async (e: React.FormEvent) => {
    e.preventDefault()
    setActivationError('')

    if (!email.trim()) {
      setActivationError('Введите email')
      return
    }
    if (password !== passwordRepeat) {
      setActivationError('Пароли не совпадают')
      return
    }
    const policyError = validatePasswordClient(password)
    if (policyError) {
      setActivationError(policyError)
      return
    }

    setActivating(true)
    try {
      const supabase = createClient()

      // a) Try sign in first
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

      if (!signInError) {
        // Sign-in succeeded — proceed to invite step
        setStep('invite')
        return
      }

      // b) If credentials are wrong (user doesn't exist yet), create the account
      if (
        signInError.message.includes('Invalid login credentials') ||
        signInError.message.includes('invalid_credentials')
      ) {
        const createResult = await createUserByInvite(email.trim(), password)
        if (!createResult.ok) {
          setActivationError(createResult.error || 'Ошибка создания аккаунта')
          return
        }

        // Sign in with freshly created account
        const { error: signInAfterCreateError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInAfterCreateError) {
          setActivationError('Аккаунт создан, но не удалось войти. Попробуйте ещё раз.')
          return
        }

        setStep('invite')
        return
      }

      // c) Other sign-in error
      setActivationError(signInError.message)
    } catch (err) {
      setActivationError('Произошла ошибка. Попробуйте ещё раз.')
      console.error('[v0] Activation error:', err)
    } finally {
      setActivating(false)
    }
  }

  /** Step 2: Accept the invite */
  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError('')

    if (inviteType === 'employee') {
      if (!token) {
        setInviteError('Пожалуйста, введите токен приглашения')
        return
      }
    } else {
      if (!token || !fullName.trim()) {
        setInviteError('Пожалуйста, заполните все поля')
        return
      }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(token)) {
      setInviteError('Неверный формат токена. Токен должен быть в формате UUID.')
      return
    }

    setAccepting(true)
    try {
      if (inviteType === 'employee') {
        const result = await acceptEmployeeInvite(token)
        if (result.error) {
          setInviteError(result.error)
          return
        }
        toast.success('Приглашение принято! Вы добавлены в команду.')
      } else {
        const result = await acceptCompanyInvite(token, fullName)
        if (result.error) {
          setInviteError(result.error)
          return
        }
        toast.success('Приглашение активировано! Добро пожаловать.')
      }

      router.push(next)
      router.refresh()
    } catch (err) {
      setInviteError('Произошла ошибка при активации приглашения')
      console.error('[v0] Accept invite error:', err)
    } finally {
      setAccepting(false)
    }
  }

  // Loading spinner while checking session
  if (step === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Step: Activation (unauthenticated + token present)
  if (step === 'activation') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              Активация приглашения
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Введите email и пароль, чтобы принять приглашение
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleActivation} className="flex flex-col gap-4">
              {activationError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{activationError}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="act-email">Email</Label>
                <Input
                  id="act-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={activating}
                  autoComplete="email"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="act-password">Пароль</Label>
                <Input
                  id="act-password"
                  type="password"
                  placeholder="Aa123456"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={activating}
                  autoComplete="new-password"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="act-password-repeat">Повтор пароля</Label>
                <Input
                  id="act-password-repeat"
                  type="password"
                  placeholder="Aa123456"
                  value={passwordRepeat}
                  onChange={(e) => setPasswordRepeat(e.target.value)}
                  disabled={activating}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Пароль: минимум 8 символов, 1 заглавная латинская буква и 1 цифра (пример: Aa123456).
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={activating}>
                {activating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Вход...
                  </>
                ) : (
                  'Продолжить'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Step: Accept invite (authenticated)
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            {inviteType === 'employee' ? 'Присоединиться к команде' : 'Активация аккаунта'}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {inviteType === 'employee'
              ? 'Введите токен приглашения для присоединения к компании'
              : 'Введите токен приглашения и ваше имя для завершения регистрации'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAcceptInvite} className="flex flex-col gap-4">
            {inviteError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{inviteError}</AlertDescription>
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
                disabled={accepting}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Токен должен быть в формате UUID (36 символов)
              </p>
            </div>

            {inviteType === 'company' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="fullName">Ваше полное имя</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Иван Иванов"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={accepting}
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={accepting}>
              {accepting ? (
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
