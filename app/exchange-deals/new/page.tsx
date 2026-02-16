import { redirect } from 'next/navigation'

// Ghost route - redirects to /exchange
// This route is deprecated. Use /exchange for client-facing exchange operations.
export default async function NewExchangeDealPage() {
  redirect('/exchange')
}
