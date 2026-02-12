export type Currency = 'RUB' | 'USD' | 'USDT' | 'EUR'

export type CashboxType = 'CASH' | 'BANK' | 'CRYPTO' | 'TRADE_IN'

export type CarStatus = 'IN_STOCK' | 'RESERVED' | 'SOLD' | 'PREP' | 'IN_TRANSIT' | 'ARCHIVED'

export type DealStatus = 'NEW' | 'IN_PROGRESS' | 'PENDING_PAYMENT' | 'PAID' | 'COMPLETED' | 'CANCELLED'

export type TransactionCategory =
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'DEAL_PAYMENT'
  | 'EXPENSE'
  | 'SALARY'
  | 'EXCHANGE_OUT'
  | 'EXCHANGE_IN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'

export type SalaryOperationType = 'ACCRUAL' | 'PAYMENT' | 'BONUS' | 'FINE' | 'ADVANCE' | 'ADJUSTMENT'

export interface Cashbox {
  id: string
  name: string
  type: CashboxType
  currency: Currency
  balance: number
  initial_balance: number
  is_hidden: boolean
  is_archived: boolean
  location?: string | null
  holder_name?: string | null
  holder_phone?: string | null
  created_at: string
  updated_at: string
}

export interface CashboxLocation {
  id: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
}

export interface Transaction {
  id: string
  cashbox_id: string
  amount: number
  balance_after: number
  category: TransactionCategory
  description: string | null
  deal_id: string | null
  reference_id: string | null
  created_at: string
  created_by: string
}

export interface ExchangeLog {
  id: string
  from_box_id: string
  to_box_id: string
  sent_amount: number
  sent_currency: Currency
  received_amount: number
  received_currency: Currency
  rate: number
  fee_amount: number
  fee_currency: Currency | null
  created_at: string
  created_by: string
}

export interface CurrencyRate {
  id: string
  from_currency: Currency
  to_currency: Currency
  rate: number
  source: string
  valid_from: string
  created_at: string
}

export interface Car {
  id: string
  vin: string | null
  brand: string
  model: string
  year: number
  color: string | null
  mileage: number | null
  status: CarStatus
  purchase_price: number | null
  purchase_currency: string
  purchase_date: string | null
  cost_price: number
  list_price: number | null
  list_currency: string
  notes: string | null
  images: string[]
  created_at: string
  updated_at: string
}

export interface CarExpense {
  id: string
  car_id: string
  category: string
  amount: number
  currency: Currency
  description: string | null
  expense_date: string
  cashbox_id: string | null
  created_at: string
  created_by: string
}

export interface CarTimeline {
  id: string
  car_id: string
  event_type: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  description: string | null
  created_at: string
  created_by: string
}

export interface StockItem {
  id: string
  sku: string | null
  name: string
  category: string
  unit: string
  quantity: number
  min_quantity: number
  avg_purchase_price: number
  sale_price: number | null
  currency: Currency
  location: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StockBatch {
  id: string
  item_id: string
  quantity: number
  remaining_quantity: number
  purchase_price: number
  currency: Currency
  supplier: string | null
  batch_date: string
  created_at: string
}

export interface StockMovement {
  id: string
  item_id: string
  batch_id: string | null
  movement_type: 'PURCHASE' | 'SALE' | 'WRITE_OFF' | 'ADJUSTMENT' | 'TRANSFER'
  quantity: number
  unit_price: number | null
  total_price: number | null
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  created_at: string
  created_by: string
}

export interface Deal {
  id: string
  deal_number: string
  client_name: string
  client_phone: string | null
  client_email: string | null
  car_id: string | null
  status: DealStatus
  total_amount: number
  total_currency: Currency
  paid_amount_usd: number
  margin_amount: number
  notes: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  created_by: string
  contact_id: string | null
}

export interface DealPayment {
  id: string
  deal_id: string
  cashbox_id: string
  amount: number
  currency: Currency
  amount_usd: number
  exchange_rate: number | null
  payment_type: 'PREPAYMENT' | 'PARTIAL' | 'FINAL' | 'REFUND'
  notes: string | null
  created_at: string
  created_by: string
}

export interface Employee {
  id: string
  user_id: string | null // Deprecated: use auth_user_id
  auth_user_id: string | null // Связь с auth.users для RBAC
  full_name: string
  position: string | null // HR должность (не права!)
  job_title: string | null
  phone: string | null
  email: string | null
  salary_balance: number
  is_active: boolean
  modules: string[] // Модули в которых работает: 'exchange', 'deals', 'auto'
  hired_at: string | null
  created_at: string
  updated_at: string
}

// Маппинг должности к ролям по умолчанию
export interface PositionDefaultRole {
  id: string
  position: string
  system_role_id: string
  created_at: string
}

export interface SalaryOperation {
  id: string
  employee_id: string
  operation_type: SalaryOperationType
  amount: number
  balance_after: number
  description: string | null
  cashbox_id: string | null
  period_month: number | null
  period_year: number | null
  created_at: string
  created_by: string
}

// === Автоплощадка ===

export type AutoClientType = 'BUYER' | 'SELLER' | 'RENTER' | 'CONSIGNOR'
export type AutoDealType = 'CASH_SALE' | 'COMMISSION_SALE' | 'INSTALLMENT' | 'RENT'
export type AutoDealStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE'
export type AutoPaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE'
export type AutoPenaltyType = 'LATE_PAYMENT' | 'DAMAGE' | 'EARLY_RETURN' | 'OTHER'
export type PlatformCarStatus = 'AVAILABLE' | 'RESERVED' | 'RENTED' | 'SOLD' | 'MAINTENANCE'

export interface AutoClient {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  passport_series: string | null
  passport_number: string | null
  passport_issued_by: string | null
  passport_issued_date: string | null
  address: string | null
  driver_license: string | null
  driver_license_date: string | null
  client_type: AutoClientType
  rating: number
  is_blacklisted: boolean
  blacklist_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  contact_id: string | null
}

export interface AutoDeal {
  id: string
  deal_number: string
  deal_type: AutoDealType
  status: AutoDealStatus
  
  car_id: string | null
  buyer_id: string | null
  seller_id: string | null
  buyer_contact_id: string | null
  seller_contact_id: string | null
  
  sale_price: number | null
  sale_currency: string
  commission_percent: number | null
  commission_amount: number | null
  
  down_payment: number | null
  installment_months: number | null
  monthly_payment: number | null
  interest_rate: number | null
  
  rent_price_daily: number | null
  rent_start_date: string | null
  rent_end_date: string | null
  deposit_amount: number | null
  
  total_paid: number
  total_debt: number
  
  contract_date: string
  completion_date: string | null
  
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AutoPayment {
  id: string
  deal_id: string
  payment_number: number
  due_date: string
  amount: number
  currency: string
  paid_amount: number
  paid_date: string | null
  status: AutoPaymentStatus
  cashbox_id: string | null
  transaction_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AutoPenalty {
  id: string
  deal_id: string
  payment_id: string | null
  penalty_type: AutoPenaltyType
  amount: number
  currency: string
  days_overdue: number | null
  penalty_rate: number | null
  is_paid: boolean
  paid_date: string | null
  description: string | null
  created_at: string
}

export interface AutoCarHistory {
  id: string
  car_id: string
  deal_id: string | null
  action_type: string
  description: string | null
  old_status: string | null
  new_status: string | null
  created_by: string | null
  created_at: string
}

// Trade-in
export type TradeInStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
export type TradeInCondition = 'EXCELLENT' | 'GOOD' | 'SATISFACTORY' | 'BAD'
export type TradeInDisposition = 'RESALE' | 'AUCTION' | 'SCRAP' | 'PARTS'

export interface AutoTrade {
  id: string
  deal_id: string
  trade_in_car_id: string | null
  trade_in_brand: string | null
  trade_in_model: string | null
  trade_in_year: number | null
  trade_in_vin: string | null
  trade_in_mileage: number | null
  trade_in_color: string | null
  trade_in_condition: TradeInCondition | null
  estimated_value: number
  final_value: number | null
  currency: string
  pts_number: string | null
  sts_number: string | null
  status: TradeInStatus
  disposition: TradeInDisposition | null
  appraised_by: string | null
  appraised_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Справочники
export interface AutoBrand {
  id: string
  name: string
  country: string | null
  logo_url: string | null
  is_active: boolean
  sort_order: number
}

export interface AutoModel {
  id: string
  brand_id: string
  name: string
  year_start: number | null
  year_end: number | null
  body_types: string[] | null
  is_active: boolean
}

export type SpecType = 'BODY_TYPE' | 'FUEL_TYPE' | 'TRANSMISSION' | 'DRIVE_TYPE' | 'COLOR' | 'INTERIOR_COLOR' | 'INTERIOR_MATERIAL'

export interface AutoSpecsOption {
  id: string
  spec_type: SpecType
  code: string
  name_ru: string
  name_en: string | null
  sort_order: number
  is_active: boolean
}

// Роли
export type AutoRoleCode = 'AUTO_ADMIN' | 'AUTO_SELLER' | 'AUTO_APPRAISER' | 'AUTO_MANAGER'

export interface AutoRole {
  id: string
  code: AutoRoleCode
  name: string
  description: string | null
  permissions: string[]
}

export interface AutoUserRole {
  id: string
  user_id: string
  role_id: string
  assigned_at: string
  assigned_by: string | null
}

// Медиа
export type MediaType = 'PHOTO' | 'DOCUMENT' | 'VIDEO'
export type DocType = 'PASSPORT' | 'PTS' | 'DCP' | 'INSURANCE' | 'CONTRACT' | 'OTHER'

export interface AutoMedia {
  id: string
  car_id: string
  media_type: MediaType
  file_url: string
  file_name: string
  mime_type: string | null
  file_size: number | null
  doc_type: DocType | null
  description: string | null
  uploaded_by: string | null
  uploaded_at: string
}

// Расходы
export type ExpenseType = 'REPAIR' | 'MAINTENANCE' | 'CLEANING' | 'DOCUMENTS' | 'STORAGE' | 'TRANSPORT' | 'OTHER'
export type PaidBy = 'COMPANY' | 'OWNER' | 'SHARED'

export interface AutoExpense {
  id: string
  car_id: string
  type: ExpenseType
  amount: number
  currency: string
  description: string
  paid_by: PaidBy
  owner_share: number
  cashbox_id: string | null
  transaction_id: string | null
  expense_date: string
  created_at: string
  created_by: string | null
}

// Инспекция
export type ConditionRating = 'EXCELLENT' | 'GOOD' | 'SATISFACTORY' | 'BAD'

export interface AutoInspection {
  id: string
  car_id: string
  body_condition: ConditionRating | null
  interior_condition: ConditionRating | null
  technical_condition: ConditionRating | null
  defects: { area: string; description: string; severity: string }[]
  recommendations: string | null
  estimated_repair_cost: number | null
  inspected_at: string
  inspected_by: string | null
  created_at: string
}

// ================================================
// МОДУЛЬ КЛИЕНТСКОГО ОБМЕНА ВАЛЮТ
// ================================================

export type ClientExchangeStatus = 'pending' | 'completed' | 'cancelled' | (string & {})

export type ProfitCalculationMethod = 'auto' | 'manual' | 'fixed_percent'
export type FixedBaseSource = 'api' | 'manual'

export interface ExchangeSettings {
  id: string
  base_currency: string
  default_margin_percent: number
  profit_calculation_method: ProfitCalculationMethod
  auto_update_rates: boolean
  rate_update_interval_minutes: number
  require_client_info: boolean
  min_exchange_amount: number
  max_exchange_amount: number | null
  working_hours_start: string
  working_hours_end: string
  created_at: string
  updated_at: string
}

export type RateSourceType = 'api' | 'manual' | 'crypto'

export interface CurrencyRateSource {
  id: string
  currency_code: string
  source_type: RateSourceType
  source_name: string
  api_url: string | null
  api_key: string | null
  is_active: boolean
  is_default: boolean
  priority: number
  last_rate: number | null
  last_updated: string | null
  update_interval_minutes: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ExchangeRate {
  id: string
  from_currency: string
  to_currency: string
  buy_rate: number
  buy_margin_percent: number
  sell_rate: number
  sell_margin_percent: number
  market_rate: number | null
  is_active: boolean
  is_popular: boolean
  is_auto_rate: boolean
  profit_calculation_method: ProfitCalculationMethod
  fixed_base_source: FixedBaseSource
  margin_percent: number
  api_rate: number | null
  api_rate_updated_at: string | null
  sort_order: number
  last_updated: string
  updated_by: string | null
  created_at: string
}

// Основная операция обмена (мультивалютная N→M)
export interface ClientExchangeOperation {
  id: string
  operation_number: string // CE-YYYYMMDD-XXXX
  operation_date: string
  daily_sequence: number
  total_client_gives_usd: number
  total_client_receives_usd: number
  profit_amount: number
  profit_currency: string
  client_name: string | null
  client_phone: string | null
  client_document: string | null
  client_notes: string | null
  status: ClientExchangeStatus
  location: string | null
  created_by: string | null
  completed_by: string | null
  cancelled_by: string | null
  cancelled_reason: string | null
  created_at: string
  completed_at: string | null
  cancelled_at: string | null
  contact_id: string | null
  // Связанные детали (для UI)
  details?: ClientExchangeDetail[]
}

// Детали операции - каждая валюта отдельной строкой
export type ExchangeDirection = 'give' | 'receive'

export interface ClientExchangeDetail {
  id: string
  operation_id: string
  direction: ExchangeDirection
  currency: string
  amount: number
  applied_rate: number | null
  market_rate: number | null
  cashbox_id: string | null
  amount_in_base: number | null
  created_at: string
  // Для UI - название кассы
  cashbox_name?: string
}

// История изменений курсов (аудит)
export interface ExchangeRateHistory {
  id: string
  rate_id: string | null
  from_currency: string
  to_currency: string
  old_buy_rate: number | null
  old_sell_rate: number | null
  old_market_rate: number | null
  new_buy_rate: number
  new_sell_rate: number
  new_market_rate: number | null
  changed_by: string | null
  change_reason: string | null
  changed_at: string
}

// ================================================
// СИСТЕМА РОЛЕЙ
// ================================================

export type SystemRoleCode = 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'CASHIER'

export interface SystemRole {
  id: string
  code: SystemRoleCode | string
  name: string
  description: string | null
  module: string
  permissions: string[]
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface UserRole {
  id: string
  user_id: string
  role_id: string
  assigned_at: string
  assigned_by: string | null
}

// ================================================
// TEAM ACCESS MODULE (HR + RBAC unified)
// ================================================

// Уровни доступа к модулю B3
export type ModuleAccessLevel = 'none' | 'view' | 'work' | 'manage'

// Бизнес-модули B3
export type BusinessModule = 'exchange' | 'auto' | 'deals' | 'stock' | 'assets' | 'finance'

// Область видимости данных (пока только 'all')
export type VisibilityScope = 'all' | 'own' | 'team' | 'branch'

// Доступ к модулям сотрудника
export interface ModuleAccess {
  exchange?: ModuleAccessLevel
  auto?: ModuleAccessLevel
  deals?: ModuleAccessLevel
  stock?: ModuleAccessLevel
  assets?: ModuleAccessLevel
  finance?: ModuleAccessLevel
}

// Видимость данных в модулях
export interface ModuleVisibility {
  exchange?: { scope: VisibilityScope }
  auto?: { scope: VisibilityScope }
  deals?: { scope: VisibilityScope }
  stock?: { scope: VisibilityScope }
  assets?: { scope: VisibilityScope }
  finance?: { scope: VisibilityScope }
}

// Назначение роли сотруднику (source of truth)
export interface EmployeeRole {
  id: string
  employee_id: string
  role_id: string
  assigned_at: string
  assigned_by: string | null
  // Joined data
  role?: SystemRole
}

// Статус приглашения сотрудника
export type InviteStatus = 'draft' | 'sent' | 'accepted' | 'cancelled'

// Приглашение сотрудника в систему
export interface EmployeeInvite {
  id: string
  employee_id: string
  email: string
  status: InviteStatus
  invited_at: string
  invited_by: string | null
  token: string | null
  expires_at: string | null
}

// Расширенный сотрудник с ролями и доступами
export interface EmployeeWithAccess extends Employee {
  roles?: SystemRole[]
  module_access?: ModuleAccess
  module_visibility?: ModuleVisibility
  invite?: EmployeeInvite
}

// Preset роли по модулям
export interface ModulePresetRole {
  module: BusinessModule
  level: ModuleAccessLevel
  role: SystemRole
}

// Результат getCurrentEmployeeAccess
export interface EmployeeAccessResult {
  employee: Employee | null
  roles: SystemRole[]
  permissions: string[]
  moduleAccess: ModuleAccess
  moduleVisibility: ModuleVisibility
  isAdmin: boolean
  hasPermission: (permission: string) => boolean
  canAccessModule: (module: BusinessModule, requiredLevel?: ModuleAccessLevel) => boolean
}

// ================================================
// МОДУЛЬ КОНТАКТЫ (ядро клиента для 3 направлений)
// ================================================

export type ContactModule = 'exchange' | 'deals' | 'auto'
export type ContactChannelType = 'phone' | 'email'

export interface Contact {
  id: string
  display_name: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ContactChannel {
  id: string
  contact_id: string
  type: ContactChannelType
  value: string
  normalized: string
  is_primary: boolean
  created_at: string
}

export interface ContactSegment {
  id: string
  contact_id: string
  module: ContactModule
  metadata: Record<string, unknown>
  last_activity_at: string | null
  created_at: string
  updated_at: string
}

export interface ContactSensitive {
  id: string
  contact_id: string
  passport_series: string | null
  passport_number: string | null
  passport_issued_by: string | null
  passport_issued_date: string | null
  address: string | null
  driver_license: string | null
  driver_license_date: string | null
  updated_at: string
  created_at: string
}

export interface ContactEvent {
  id: string
  contact_id: string
  module: ContactModule
  entity_type: string
  entity_id: string | null
  title: string
  payload: Record<string, unknown>
  happened_at: string
  created_at: string
}

// Расширенный контакт с каналами и сегментами (для UI)
export interface ContactWithDetails extends Contact {
  channels?: ContactChannel[]
  segments?: ContactSegment[]
  primary_phone?: string
  primary_email?: string
}

// ================================================
// AUDIT LOG (v2)
// ================================================

export type AuditModule = 'assets' | 'finance' | 'exchange' | 'deals' | 'auto' | 'stock' | 'contacts' | 'system'

export interface AuditLogEntry {
  id: string
  actor_employee_id: string | null
  action: string
  module: AuditModule
  entity_table: string
  entity_id: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
  // Joined
  actor_employee?: Employee
}

// ================================================
// ASSETS MODULE
// ================================================

export type AssetType = 'auto' | 'equipment' | 'moto' | 'real_estate' | 'crypto' | 'gold' | 'other'
export type AssetStatus = 'in_stock' | 'company_owned' | 'pledged' | 'replaced' | 'released' | 'foreclosed' | 'moved_to_cars_stock' | 'on_sale' | 'sold' | 'written_off'

export interface Asset {
  id: string
  asset_type: AssetType
  title: string
  status: AssetStatus
  owner_contact_id: string | null
  responsible_employee_id: string | null
  notes: string | null
  metadata: Record<string, unknown>
  visibility_mode: 'public' | 'restricted'
  allowed_role_codes: string[]
  client_audience_notes: Record<string, unknown>
  is_divisible: boolean
  total_units: number | null
  available_units: number | null
  created_at: string
  updated_at: string
  // Joined data
  owner_contact?: Contact
  responsible_employee?: Employee
  latest_valuation?: AssetValuation
  current_location?: AssetLocation
}

export interface AssetLocation {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface AssetLocationMove {
  id: string
  asset_id: string
  from_location_id: string | null
  to_location_id: string | null
  moved_at: string
  moved_by_employee_id: string | null
  note: string | null
  // Joined
  from_location?: AssetLocation
  to_location?: AssetLocation
  moved_by_employee?: Employee
}

export interface AssetValuation {
  id: string
  asset_id: string
  valuation_amount: number
  valuation_currency: string
  base_amount: number
  base_currency: string
  fx_rate: number | null
  source_note: string | null
  created_at: string
  created_by_employee_id: string | null
  // Joined
  created_by_employee?: Employee
}

export interface AssetSaleEvent {
  id: string
  asset_id: string
  related_finance_deal_id: string | null
  sold_at: string
  sale_amount: number
  sale_currency: string
  base_amount: number
  base_currency: string
  fx_rate: number | null
  distribution: Record<string, unknown>
  created_by_employee_id: string | null
  visibility_mode: 'public' | 'restricted'
  allowed_role_codes: string[]
  client_audience_notes: Record<string, unknown>
}

// ================================================
// FINANCE DEALS MODULE
// ================================================

export type CoreDealKind = 'finance'
export type CoreDealStatus = 'NEW' | 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'DEFAULT' | 'CANCELLED'
export type FinanceScheduleType = 'annuity' | 'diff' | 'interest_only' | 'manual' | 'tranches'
export type FinancePaymentStatus = 'PLANNED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'ADJUSTED'
export type FinanceLedgerEntryType = 'disbursement' | 'repayment_principal' | 'repayment_interest' | 'fee' | 'penalty_manual' | 'adjustment' | 'offset' | 'collateral_sale_proceeds'
export type CollateralLinkStatus = 'active' | 'released' | 'foreclosed' | 'replaced'

export interface CoreDeal {
  id: string
  kind: CoreDealKind
  subtype: string | null
  status: CoreDealStatus
  sub_status: string | null
  title: string
  base_currency: string
  contact_id: string | null
  responsible_employee_id: string | null
  client_audience_notes: Record<string, unknown>
  visibility_mode: 'public' | 'restricted'
  allowed_role_codes: string[]
  created_at: string
  updated_at: string
  // Joined
  contact?: Contact
  responsible_employee?: Employee
  finance_deal?: FinanceDeal
  }

export interface FinanceDeal {
  id: string
  core_deal_id: string
  principal_amount: number
  contract_currency: string
  term_months: number
  rate_percent: number
  schedule_type: FinanceScheduleType
  allow_tranches: boolean
  rules: Record<string, unknown>
  visibility_mode: 'public' | 'restricted'
  allowed_role_codes: string[]
  client_audience_notes: Record<string, unknown>
  // Joined
  core_deal?: CoreDeal
  participants?: FinanceParticipant[]
  payment_schedule?: FinancePaymentScheduleItem[]
  collateral_links?: FinanceCollateralLink[]
}

export interface FinanceParticipant {
  id: string
  finance_deal_id: string
  contact_id: string | null
  employee_id: string | null
  participant_role: string
  is_primary: boolean
  note: string | null
  // Joined
  contact?: Contact
  employee?: Employee
}

export interface FinancePaymentScheduleItem {
  id: string
  finance_deal_id: string
  due_date: string
  principal_due: number
  interest_due: number
  total_due: number
  currency: string
  status: FinancePaymentStatus
  principal_paid?: number
  interest_paid?: number
  amount_paid?: number
  paid_date?: string
  notes?: string
  }

export interface FinanceLedgerEntry {
  id: string
  finance_deal_id: string
  entry_type: FinanceLedgerEntryType
  occurred_at: string
  amount: number
  currency: string
  base_amount: number
  base_currency: string
  fx_rate: number | null
  allocation: Record<string, unknown>
  note: string | null
  created_by_employee_id: string | null
  visibility_mode: 'public' | 'restricted'
  allowed_role_codes: string[]
  client_audience_notes: Record<string, unknown>
}

export interface FinancePausePeriod {
  id: string
  finance_deal_id: string
  start_date: string
  end_date: string
  reason: string | null
  created_by_employee_id: string | null
  created_at: string
}

export interface FinanceCollateralLink {
  id: string
  finance_deal_id: string
  asset_id: string
  status: CollateralLinkStatus
  started_at: string
  ended_at: string | null
  note: string | null
  pledged_units: number | null
  valuation_at_pledge: number | null
  ltv_at_pledge: number | null
  // Joined
  asset?: Asset
}

export interface FinanceCollateralChain {
  id: string
  finance_deal_id: string
  old_asset_id: string
  new_asset_id: string
  reason: string | null
  created_by_employee_id: string | null
  created_at: string
  // Joined
  old_asset?: Asset
  new_asset?: Asset
}

// ================================================
// EXCHANGE EXTENSIONS
// ================================================

export type ExtendedExchangeStatus = 'pending' | 'completed' | 'cancelled' | 'quoted' | 'awaiting_funds' | 'awaiting_liquidity' | 'in_delivery' | 'delivered' | 'confirmed' | 'dispute' | string

export interface ExchangeStatus {
  code: string
  name: string
  sort_order: number
  is_system: boolean
  is_active: boolean
}

export interface ClientExchangeParticipant {
  id: string
  operation_id: string
  contact_id: string | null
  employee_id: string | null
  role: string
  note: string | null
  created_at: string
  // Joined
  contact?: Contact
  employee?: Employee
}

// Extended operation with new fields
export interface ClientExchangeOperationExtended extends ClientExchangeOperation {
  status_code: string | null
  responsible_employee_id: string | null
  followup_at: string | null
  followup_note: string | null
  participants?: ClientExchangeParticipant[]
  responsible_employee?: Employee
}

// Extended detail with handover fields
export interface ClientExchangeDetailExtended extends ClientExchangeDetail {
  handover_contact_id: string | null
  handover_employee_id: string | null
  visibility_mode: 'public' | 'restricted'
  allowed_role_codes: string[]
  client_audience_notes: Record<string, unknown>
  // Joined
  handover_contact?: Contact
  handover_employee?: Employee
}

// ================================================
// UNIFIED DEALS VIEW
// ================================================

export type UnifiedDealSource = 'legacy_deals' | 'auto_deals' | 'finance'
export type UnifiedDealKind = 'deals' | 'auto' | 'finance'

export interface UnifiedDeal {
  unified_id: string
  source: UnifiedDealSource
  entity_id: string
  kind: UnifiedDealKind
  title: string
  status: string
  amount: number | null
  currency: string | null
  contact_id: string | null
  created_at: string
}

// ================================================
// TIMELINE VIEWS
// ================================================

export interface TimelineEvent {
  event_time: string
  lane: 'money' | 'assets'
  module: string
  event_type: string
  entity_id: string
  finance_deal_id: string
  title: string
  amount: number | null
  currency: string | null
  base_amount: number | null
  visibility_mode: string
  allowed_role_codes: string[]
  client_audience_notes: Record<string, unknown>
  created_by_employee_id: string | null
}

export interface AssetTimelineEvent {
  event_time: string
  event_type: string
  entity_id: string
  asset_id: string
  title: string
  amount: number | null
  currency: string | null
  created_by_employee_id: string | null
}
