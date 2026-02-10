/**
 * Константы для модуля Team Access (HR + RBAC unified)
 */

import type { BusinessModule, ModuleAccessLevel } from '@/lib/types/database'

// Бизнес-модули B3
export const MODULES: { id: BusinessModule; label: string }[] = [
  { id: 'exchange', label: 'Обмен валют' },
  { id: 'auto', label: 'Автоплощадка' },
  { id: 'deals', label: 'Сделки' },
  { id: 'stock', label: 'Склад' },
  { id: 'assets', label: 'Имущество' },
  { id: 'finance', label: 'Финансовые сделки' },
]

// Уровни доступа к модулю
export const ACCESS_LEVELS: { id: ModuleAccessLevel; label: string }[] = [
  { id: 'none', label: 'Нет' },
  { id: 'view', label: 'Просмотр' },
  { id: 'work', label: 'Работа' },
  { id: 'manage', label: 'Управление' },
]

// Маппинг уровня доступа к коду preset-роли
export const PRESET_ROLE_CODE_BY_MODULE_LEVEL: Record<
  BusinessModule,
  Partial<Record<Exclude<ModuleAccessLevel, 'none'>, string>>
> = {
  exchange: {
    view: 'EXCHANGE_VIEW',
    work: 'EXCHANGE_WORK',
    manage: 'EXCHANGE_MANAGE',
  },
  auto: {
    view: 'AUTO_VIEW',
    work: 'AUTO_WORK',
    manage: 'AUTO_MANAGE',
  },
  deals: {
    view: 'DEALS_VIEW',
    work: 'DEALS_WORK',
    manage: 'DEALS_MANAGE',
  },
  stock: {
    view: 'STOCK_VIEW',
    work: 'STOCK_WORK',
    manage: 'STOCK_MANAGE',
  },
  assets: {
    view: 'ASSETS_VIEW',
    work: 'ASSETS_WORK',
    manage: 'ASSETS_MANAGE',
  },
  finance: {
    view: 'FINANCE_VIEW',
    work: 'FINANCE_WORK',
    manage: 'FINANCE_MANAGE',
  },
}

// Обратный маппинг: код роли -> модуль + уровень
export const MODULE_LEVEL_BY_ROLE_CODE: Record<string, { module: BusinessModule; level: ModuleAccessLevel }> = {
  EXCHANGE_VIEW: { module: 'exchange', level: 'view' },
  EXCHANGE_WORK: { module: 'exchange', level: 'work' },
  EXCHANGE_MANAGE: { module: 'exchange', level: 'manage' },
  AUTO_VIEW: { module: 'auto', level: 'view' },
  AUTO_WORK: { module: 'auto', level: 'work' },
  AUTO_MANAGE: { module: 'auto', level: 'manage' },
  DEALS_VIEW: { module: 'deals', level: 'view' },
  DEALS_WORK: { module: 'deals', level: 'work' },
  DEALS_MANAGE: { module: 'deals', level: 'manage' },
  STOCK_VIEW: { module: 'stock', level: 'view' },
  STOCK_WORK: { module: 'stock', level: 'work' },
  STOCK_MANAGE: { module: 'stock', level: 'manage' },
  ASSETS_VIEW: { module: 'assets', level: 'view' },
  ASSETS_WORK: { module: 'assets', level: 'work' },
  ASSETS_MANAGE: { module: 'assets', level: 'manage' },
  FINANCE_VIEW: { module: 'finance', level: 'view' },
  FINANCE_WORK: { module: 'finance', level: 'work' },
  FINANCE_MANAGE: { module: 'finance', level: 'manage' },
}

// Все коды preset ролей модулей
export const ALL_MODULE_PRESET_ROLE_CODES = Object.keys(MODULE_LEVEL_BY_ROLE_CODE)

// Области видимости данных
export const VISIBILITY_SCOPES: { id: string; label: string; disabled?: boolean }[] = [
  { id: 'all', label: 'Все данные' },
  { id: 'own', label: 'Только свои', disabled: true },
  { id: 'team', label: 'Команда', disabled: true },
  { id: 'branch', label: 'Филиал', disabled: true },
]
