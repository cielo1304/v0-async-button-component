import { redirect } from 'next/navigation'

export default function HRPage() {
  redirect('/settings?tab=hr')
}
