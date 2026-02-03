import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type CarStatus = 'stock' | 'sold' | 'preparing' | 'reserved' | 'inspection' | 'auction'
export type DealStatus = 'draft' | 'active' | 'closed' | 'cancelled'
export type Status = CarStatus | DealStatus | string

interface StatusBadgeProps {
  status: Status
  className?: string
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  // Car statuses
  stock: { label: 'На складе', variant: 'default' },
  sold: { label: 'Продано', variant: 'success' },
  preparing: { label: 'Подготовка', variant: 'warning' },
  reserved: { label: 'Забронировано', variant: 'warning' },
  inspection: { label: 'Осмотр', variant: 'secondary' },
  auction: { label: 'Аукцион', variant: 'secondary' },
  
  // Deal statuses
  draft: { label: 'Черновик', variant: 'secondary' },
  active: { label: 'Активно', variant: 'warning' },
  closed: { label: 'Закрыто', variant: 'success' },
  cancelled: { label: 'Отменено', variant: 'destructive' },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || { label: status, variant: 'default' as const }
  
  const variantClasses = {
    default: 'bg-muted text-muted-foreground hover:bg-muted',
    success: 'bg-success/10 text-success hover:bg-success/20 border-success/20',
    warning: 'bg-warning/10 text-warning-foreground hover:bg-warning/20 border-warning/20',
    destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary',
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium',
        variantClasses[config.variant],
        className
      )}
    >
      {config.label}
    </Badge>
  )
}
