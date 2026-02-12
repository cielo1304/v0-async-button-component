/**
 * Finance schedule calculation module.
 * Pure functions — no I/O, no DB.
 */

export interface ScheduleRow {
  period: number
  dueDate: string // ISO date
  principalDue: number
  interestDue: number
  totalDue: number
}

export interface ScheduleInput {
  principal: number
  annualRate: number // e.g. 12 means 12 %
  termMonths: number
  startDate: string // ISO date, first payment = startDate + 1 month
  scheduleType: 'annuity' | 'diff' | 'interest_only' | 'manual' | 'tranches'
  pausePeriods?: Array<{ startDate: string; endDate: string }>
}

/**
 * Add N months to a date string (ISO), clamping to end of month.
 */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + months)
  // Clamp to last day of resulting month if overflow
  if (d.getUTCDate() < day) {
    d.setUTCDate(0) // go to last day of prev month
  }
  return d.toISOString().slice(0, 10)
}

/**
 * Count how many days of a given month interval [from, to) fall inside pause periods.
 */
function pausedDaysInRange(from: string, to: string, pauses: Array<{ startDate: string; endDate: string }>): number {
  const rangeStart = new Date(from + 'T00:00:00Z').getTime()
  const rangeEnd = new Date(to + 'T00:00:00Z').getTime()
  let pausedMs = 0
  for (const p of pauses) {
    const pStart = new Date(p.startDate + 'T00:00:00Z').getTime()
    const pEnd = new Date(p.endDate + 'T00:00:00Z').getTime()
    const overlapStart = Math.max(rangeStart, pStart)
    const overlapEnd = Math.min(rangeEnd, pEnd)
    if (overlapEnd > overlapStart) {
      pausedMs += overlapEnd - overlapStart
    }
  }
  return Math.round(pausedMs / (1000 * 60 * 60 * 24))
}

function daysInRange(from: string, to: string): number {
  const ms = new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

/**
 * Is a date inside any pause period?
 */
function isDatePaused(date: string, pauses: Array<{ startDate: string; endDate: string }>): boolean {
  for (const p of pauses) {
    if (date >= p.startDate && date <= p.endDate) return true
  }
  return false
}

/**
 * Round to 2 decimal places.
 */
function r2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Generate annuity schedule.
 * PMT = P * r / (1 - (1+r)^-n)
 */
function generateAnnuity(input: ScheduleInput): ScheduleRow[] {
  const { principal, annualRate, termMonths, startDate, pausePeriods = [] } = input
  const monthlyRate = annualRate / 100 / 12
  const rows: ScheduleRow[] = []
  let remaining = principal

  // PMT formula
  const pmt = monthlyRate > 0
    ? principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths))
    : principal / termMonths

  let periodIndex = 0
  for (let i = 1; i <= termMonths; i++) {
    const dueDate = addMonths(startDate, i)
    const prevDate = addMonths(startDate, i - 1)

    // Check pause: if entire month is paused, skip principal, accrue 0 interest
    const totalDays = daysInRange(prevDate, dueDate)
    const pausedDays = pausedDaysInRange(prevDate, dueDate, pausePeriods)
    const activeFraction = totalDays > 0 ? Math.max(0, (totalDays - pausedDays) / totalDays) : 1

    if (activeFraction === 0) {
      // Fully paused month: no payment row generated
      continue
    }

    periodIndex++
    const interest = r2(remaining * monthlyRate * activeFraction)
    let principalPart = r2(pmt - interest)
    if (principalPart > remaining) principalPart = r2(remaining)
    remaining = r2(remaining - principalPart)

    rows.push({
      period: periodIndex,
      dueDate,
      principalDue: principalPart,
      interestDue: interest,
      totalDue: r2(principalPart + interest),
    })
  }

  // Fix rounding: last row absorbs remainder
  if (rows.length > 0 && remaining !== 0) {
    const last = rows[rows.length - 1]
    last.principalDue = r2(last.principalDue + remaining)
    last.totalDue = r2(last.principalDue + last.interestDue)
  }

  return rows
}

/**
 * Generate differentiated schedule.
 * Fixed principal per month, decreasing interest.
 */
function generateDiff(input: ScheduleInput): ScheduleRow[] {
  const { principal, annualRate, termMonths, startDate, pausePeriods = [] } = input
  const monthlyRate = annualRate / 100 / 12
  const fixedPrincipal = r2(principal / termMonths)
  const rows: ScheduleRow[] = []
  let remaining = principal
  let periodIndex = 0

  for (let i = 1; i <= termMonths; i++) {
    const dueDate = addMonths(startDate, i)
    const prevDate = addMonths(startDate, i - 1)

    const totalDays = daysInRange(prevDate, dueDate)
    const pausedDays = pausedDaysInRange(prevDate, dueDate, pausePeriods)
    const activeFraction = totalDays > 0 ? Math.max(0, (totalDays - pausedDays) / totalDays) : 1

    if (activeFraction === 0) continue

    periodIndex++
    const interest = r2(remaining * monthlyRate * activeFraction)
    let principalPart = i === termMonths ? r2(remaining) : fixedPrincipal
    if (principalPart > remaining) principalPart = r2(remaining)
    remaining = r2(remaining - principalPart)

    rows.push({
      period: periodIndex,
      dueDate,
      principalDue: principalPart,
      interestDue: interest,
      totalDue: r2(principalPart + interest),
    })
  }

  return rows
}

/**
 * Generate interest-only schedule.
 * Only interest monthly, full principal at the end.
 */
function generateInterestOnly(input: ScheduleInput): ScheduleRow[] {
  const { principal, annualRate, termMonths, startDate, pausePeriods = [] } = input
  const monthlyRate = annualRate / 100 / 12
  const rows: ScheduleRow[] = []
  let periodIndex = 0

  for (let i = 1; i <= termMonths; i++) {
    const dueDate = addMonths(startDate, i)
    const prevDate = addMonths(startDate, i - 1)

    const totalDays = daysInRange(prevDate, dueDate)
    const pausedDays = pausedDaysInRange(prevDate, dueDate, pausePeriods)
    const activeFraction = totalDays > 0 ? Math.max(0, (totalDays - pausedDays) / totalDays) : 1

    if (activeFraction === 0) continue

    periodIndex++
    const interest = r2(principal * monthlyRate * activeFraction)
    const principalPart = i === termMonths ? principal : 0

    rows.push({
      period: periodIndex,
      dueDate,
      principalDue: principalPart,
      interestDue: interest,
      totalDue: r2(principalPart + interest),
    })
  }

  return rows
}

/**
 * Main schedule generator. Returns empty array for 'manual' / 'tranches'.
 */
export function generateSchedule(input: ScheduleInput): ScheduleRow[] {
  switch (input.scheduleType) {
    case 'annuity':
      return generateAnnuity(input)
    case 'diff':
      return generateDiff(input)
    case 'interest_only':
      return generateInterestOnly(input)
    case 'manual':
    case 'tranches':
      return [] // manual rows are added by the user
  }
}

/**
 * Compute deal balances from ledger entries.
 */
export interface DealBalances {
  totalDisbursed: number
  principalRepaid: number
  interestRepaid: number
  feesAndPenalties: number
  adjustments: number
  collateralProceeds: number
  outstandingPrincipal: number
  totalOwed: number // outstanding principal + unpaid interest from schedule
}

export function computeBalances(
  _principalAmount: number,
  ledger: Array<{ entry_type: string; amount: number }>,
): DealBalances {
  let totalDisbursed = 0
  let principalRepaid = 0
  let interestRepaid = 0
  let feesAndPenalties = 0
  let adjustments = 0
  let collateralProceeds = 0

  for (const e of ledger) {
    const amt = Number(e.amount) || 0
    switch (e.entry_type) {
      case 'disbursement':
        totalDisbursed += amt
        break
      case 'principal_repayment':
      case 'early_repayment':
        principalRepaid += amt
        break
      case 'interest_payment':
        interestRepaid += amt
        break
      case 'fee':
      case 'penalty':
        feesAndPenalties += amt
        break
      case 'adjustment':
      case 'offset':
        adjustments += amt
        break
      case 'collateral_sale_proceeds':
        collateralProceeds += amt
        break
    }
  }

  const outstandingPrincipal = r2(totalDisbursed - principalRepaid - collateralProceeds - adjustments)

  return {
    totalDisbursed: r2(totalDisbursed),
    principalRepaid: r2(principalRepaid),
    interestRepaid: r2(interestRepaid),
    feesAndPenalties: r2(feesAndPenalties),
    adjustments: r2(adjustments),
    collateralProceeds: r2(collateralProceeds),
    outstandingPrincipal: Math.max(0, outstandingPrincipal),
    totalOwed: Math.max(0, outstandingPrincipal),
  }
}

/**
 * Format money with currency symbol.
 */
const SYMBOLS: Record<string, string> = { USD: '$', EUR: '\u20AC', GEL: '\u20BE', RUB: '\u20BD', USDT: '\u20AE', AED: 'AED', TRY: '\u20BA' }
export function formatMoney(amount: number | string, currency = 'USD'): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return `${SYMBOLS[currency] || currency} 0.00`
  return `${SYMBOLS[currency] || currency} ${n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Count total paused days.
 */
export function totalPausedDays(pauses: Array<{ startDate: string; endDate: string }>): number {
  let total = 0
  for (const p of pauses) {
    const days = daysInRange(p.startDate, p.endDate)
    if (days > 0) total += days
  }
  return total
}
