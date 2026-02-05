import type { ContactModule } from '@/lib/types/database'

// Модули системы контактов
export const CONTACT_MODULES: { code: ContactModule; label: string; icon: string }[] = [
  { code: 'exchange', label: 'Обмен валют', icon: 'ArrowLeftRight' },
  { code: 'deals', label: 'Сделки', icon: 'FileText' },
  { code: 'auto', label: 'Автоплощадка', icon: 'Car' },
]

// Названия модулей для отображения
export const MODULE_LABELS: Record<ContactModule, string> = {
  exchange: 'Обмен валют',
  deals: 'Сделки',
  auto: 'Автоплощадка',
}

// Цвета модулей для бейджей
export const MODULE_COLORS: Record<ContactModule, string> = {
  exchange: 'bg-amber-500/20 text-amber-400',
  deals: 'bg-blue-500/20 text-blue-400',
  auto: 'bg-emerald-500/20 text-emerald-400',
}

// Права доступа для модуля контактов
export const CONTACT_PERMISSIONS = {
  // Чтение сегментов по модулям
  SEGMENT_EXCHANGE_READ: 'contacts.segment.exchange.read',
  SEGMENT_DEALS_READ: 'contacts.segment.deals.read',
  SEGMENT_AUTO_READ: 'contacts.segment.auto.read',
  
  // Общие права
  READ: 'contacts.read',
  WRITE: 'contacts.write',
  
  // Чувствительные данные
  SENSITIVE_READ: 'contacts.sensitive.read',
} as const

// Все права для режима "Глаз Бога"
export const ALL_CONTACT_PERMISSIONS = Object.values(CONTACT_PERMISSIONS)

// Типы каналов связи
export const CHANNEL_TYPES = [
  { code: 'phone', label: 'Телефон' },
  { code: 'email', label: 'Email' },
] as const

// Типы событий контакта
export const EVENT_ENTITY_TYPES = {
  // Обмен
  CLIENT_EXCHANGE_OPERATION: 'client_exchange_operation',
  
  // Сделки
  DEAL: 'deal',
  DEAL_PAYMENT: 'deal_payment',
  
  // Авто
  AUTO_CLIENT: 'auto_client',
  AUTO_DEAL: 'auto_deal',
  AUTO_PAYMENT: 'auto_payment',
} as const
