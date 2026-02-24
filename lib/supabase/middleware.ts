import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session - important for token rotation
  // Wrap in try-catch so preview / offline environments don't break
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // Supabase unreachable – let the request through;
    // server actions have their own auth guards.
    return supabaseResponse
  }

  const { pathname } = request.nextUrl

  // Allow public paths without auth
  const isPublicPath =
    pathname === '/login' ||
    pathname.startsWith('/auth') ||        // /auth/callback must be reachable unauthenticated
    pathname.startsWith('/onboarding') ||  // onboarding is reached before membership exists
    pathname.startsWith('/set-password') || // set-password is reached before session is established
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg')

  // No user and not a public path -> redirect to /login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // User is logged in and on /login -> redirect to home (or next param)
  if (user && pathname === '/login') {
    const next = request.nextUrl.searchParams.get('next') || '/'
    const url = request.nextUrl.clone()
    url.pathname = next
    url.searchParams.delete('next')
    return NextResponse.redirect(url)
  }

  // Onboarding gate: if user has no membership and is not platform admin, redirect to /onboarding
  const onboardingAllowlist = [
    '/onboarding',
    '/set-password',
    '/platform',
    '/login',
    '/auth',
    '/_next',
    '/api',
  ]
  const needsOnboardingCheck = user && !onboardingAllowlist.some(path => pathname.startsWith(path))

  if (needsOnboardingCheck) {
    try {
      // Check if platform admin
      const { data: isAdmin } = await supabase.rpc('is_platform_admin')
      
      if (!isAdmin) {
        // Check if user has team membership
        const { data: membership } = await supabase
          .from('team_members')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()

        if (!membership) {
          // No membership found -> redirect to onboarding
          const url = request.nextUrl.clone()
          url.pathname = '/onboarding'
          url.searchParams.set('next', pathname)
          return NextResponse.redirect(url)
        }
      }
    } catch (err) {
      console.error('[v0] Onboarding gate error:', err)
      // On error, let request through to avoid blocking legitimate users
    }
  }

  return supabaseResponse
}
