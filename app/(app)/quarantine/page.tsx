import { redirect } from 'next/navigation'

// Archive has been merged into History (two-tab page).
export default function QuarantinePage() {
  redirect('/history')
}
