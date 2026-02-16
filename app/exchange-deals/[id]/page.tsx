import { redirect } from 'next/navigation'

// Ghost route - redirects to /exchange
export default async function ExchangeDealDetailsPage({ params }: { params: { id: string } }) {
  redirect('/exchange')
}

/* 
// DEPRECATED - This route is now a ghost route
import { getExchangeDealById } from '@/app/actions/exchange'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft, ArrowDown, ArrowUp } from 'lucide-react'
import { notFound } from 'next/navigation'
import { PostToCashboxesButton } from '@/components/exchange/post-to-cashboxes-button'


const statusVariants: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary',
  completed: 'default',
  cancelled: 'destructive'
}

const statusLabels: Record<string, string> = {
  draft: 'Черновик',
  completed: 'Завершена',
  cancelled: 'Отменена'
}

const assetKindLabels: Record<string, string> = {
  fiat: 'Фиат',
  crypto: 'Крипто',
  gold: 'Золото',
  other: 'Другое'
}

*/
