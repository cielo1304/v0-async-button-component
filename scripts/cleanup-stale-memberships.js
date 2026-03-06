/**
 * Cleanup stale platform admin membership artifacts.
 * 
 * Old View-As created real team_members + viewer employees for platform admins.
 * These cause A+B scope merge. This script removes them.
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('=== Cleanup stale platform admin membership artifacts ===')

  // Step 1: Get all platform admin user_ids
  const { data: platformAdmins, error: paError } = await admin
    .from('platform_admins')
    .select('user_id')

  if (paError) {
    console.error('Failed to query platform_admins:', paError.message)
    return
  }

  if (!platformAdmins || platformAdmins.length === 0) {
    console.log('No platform admins found. Nothing to clean.')
    return
  }

  const adminUserIds = platformAdmins.map(pa => pa.user_id)
  console.log(`Found ${adminUserIds.length} platform admin(s):`, adminUserIds)

  // Step 2: Find all team_members rows for platform admins
  for (const userId of adminUserIds) {
    console.log(`\n--- Processing platform admin: ${userId} ---`)

    const { data: teamMembers, error: tmError } = await admin
      .from('team_members')
      .select('id, company_id, employee_id, member_role')
      .eq('user_id', userId)

    if (tmError) {
      console.error(`  Failed to query team_members for ${userId}:`, tmError.message)
      continue
    }

    if (!teamMembers || teamMembers.length === 0) {
      console.log('  No team_members rows found. Clean.')
      continue
    }

    console.log(`  Found ${teamMembers.length} team_members row(s)`)

    for (const tm of teamMembers) {
      console.log(`  Checking team_member ${tm.id} (company: ${tm.company_id}, employee: ${tm.employee_id})`)

      let shouldDelete = false
      let employeeInfo = null

      if (tm.employee_id) {
        // Check if the linked employee is a viewer/system employee
        const { data: emp } = await admin
          .from('employees')
          .select('id, full_name, auth_user_id')
          .eq('id', tm.employee_id)
          .maybeSingle()

        employeeInfo = emp

        if (emp) {
          const isViewerEmployee = emp.full_name?.includes('Просмотр') || 
                                    emp.full_name?.includes('админ платформы')
          const isNullAuth = emp.auth_user_id === null

          if (isViewerEmployee) {
            shouldDelete = true
            console.log(`    -> VIEWER employee: "${emp.full_name}" (will delete)`)
          } else if (isNullAuth && emp.full_name?.includes('системн')) {
            shouldDelete = true
            console.log(`    -> SYSTEM employee with null auth: "${emp.full_name}" (will delete)`)
          } else {
            console.log(`    -> REAL employee: "${emp.full_name}" (keeping)`)
          }
        } else {
          // Orphan employee_id reference - delete the team_member
          shouldDelete = true
          console.log(`    -> ORPHAN employee_id (no employee found, will delete)`)
        }
      } else {
        // team_member with no employee_id - suspicious for platform admin
        shouldDelete = true
        console.log(`    -> No employee_id linked (will delete)`)
      }

      if (shouldDelete) {
        // Delete team_member first (FK)
        const { error: delTmError } = await admin
          .from('team_members')
          .delete()
          .eq('id', tm.id)

        if (delTmError) {
          console.error(`    FAILED to delete team_member ${tm.id}:`, delTmError.message)
        } else {
          console.log(`    DELETED team_member ${tm.id}`)
        }

        // Delete viewer employee if it exists and is a viewer
        if (employeeInfo && (employeeInfo.full_name?.includes('Просмотр') || employeeInfo.auth_user_id === null)) {
          const { error: delEmpError } = await admin
            .from('employees')
            .delete()
            .eq('id', employeeInfo.id)

          if (delEmpError) {
            console.error(`    FAILED to delete employee ${employeeInfo.id}:`, delEmpError.message)
          } else {
            console.log(`    DELETED viewer employee ${employeeInfo.id} ("${employeeInfo.full_name}")`)
          }
        }
      }
    }
  }

  // Step 3: Final verification - check remaining memberships
  console.log('\n=== Final verification ===')
  for (const userId of adminUserIds) {
    const { data: remaining } = await admin
      .from('team_members')
      .select('id, company_id, employee_id')
      .eq('user_id', userId)

    if (remaining && remaining.length > 0) {
      console.log(`WARNING: Platform admin ${userId} still has ${remaining.length} team_members row(s):`)
      for (const r of remaining) {
        console.log(`  - team_member ${r.id} (company: ${r.company_id})`)
      }
    } else {
      console.log(`OK: Platform admin ${userId} has NO team_members rows.`)
    }
  }

  console.log('\n=== Cleanup complete ===')
}

main().catch(err => {
  console.error('Cleanup script failed:', err)
  process.exit(1)
})
