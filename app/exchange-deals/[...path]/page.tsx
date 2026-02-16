import { redirect } from 'next/navigation'

// Catch-all route for /exchange-deals/*
// Redirects all exchange-deals paths to /exchange
// This prevents 404 errors for ghost routes

export default function ExchangeDealsNotFound() {
  redirect('/exchange')
}
