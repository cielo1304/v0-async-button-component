import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Return a safe internal redirect target from a raw `next` param. */
function safeRedirect(raw: string | null): string {
  if (!raw) return '/'
  let decoded: string
  try { decoded = decodeURIComponent(raw) } catch { return '/' }
  if (!decoded.startsWith('/') || decoded.startsWith('/onboarding') || decoded.startsWith('/login')) return '/'
  return decoded
}

export async function updateSession(request: NextRequest) {
  // If env vars are missing (e.g. preview without integration configured),
  // let the request through rather than crashing with a Supabase client error.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
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
    const next = safeRedirect(request.nextUrl.searchParams.get('next'))
    const url = request.nextUrl.clone()
    url.pathname = next
    url.search = ''
    return NextResponse.redirect(url)
  }

  // ----------------------------------------------------------------
  // Onboarding gate
  // Routes that never need a membership check:
  const onboardingBypass = [
    '/set-password',
    '/platform',
    '/auth',
    '/_next',
    '/api',
  ]
  const isOnboarding = pathname.startsWith('/onboarding')
  const needsMembershipCheck =
    user &&
    !isOnboarding &&
    !onboardingBypass.some(p => pathname.startsWith(p))

  if (needsMembershipCheck || (user && isOnboarding)) {
    try {
      // Check platform admin first (cheapest short-circuit)
      const { data: isAdmin } = await supabase.rpc('is_platform_admin')

      if (!isAdmin) {
        const { data: membership } = await supabase
          .from('team_members')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()

        if (isOnboarding && membership) {
          // User already has membership but landed on /onboarding -> send them home
          const next = safeRedirect(request.nextUrl.searchParams.get('next'))
          const url = request.nextUrl.clone()
          url.pathname = next
          url.search = ''
          return NextResponse.redirect(url)
        }

        if (!isOnboarding && !membership) {
          // No membership -> redirect to onboarding
          const url = request.nextUrl.clone()
          url.pathname = '/onboarding'
          url.search = ''
          url.searchParams.set('next', pathname)
          return NextResponse.redirect(url)
        }
      } else if (user && isOnboarding) {
        // Platform admin on /onboarding -> send to /platform
        const url = request.nextUrl.clone()
        url.pathname = '/platform'
        url.search = ''
        return NextResponse.redirect(url)
      }
    } catch {
      // On error let the request through; server actions have their own guards.
    }
  }

  return supabaseResponse
}
