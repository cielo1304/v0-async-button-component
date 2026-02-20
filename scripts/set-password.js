import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function setUserPassword() {
  try {
    // Update password for the user
    const { data, error } = await supabase.auth.admin.updateUserById(
      // First, we need to find the user ID by email
      // This is a two-step process
      '',
      {
        password: '123456aa',
      }
    )

    if (error) {
      console.error('Error updating password:', error.message)
      return
    }

    console.log('[v0] Password updated successfully for user:', data.user?.id)
    console.log('[v0] Email:', data.user?.email)
  } catch (err) {
    console.error('[v0] Error:', err)
  }
}

setUserPassword()
