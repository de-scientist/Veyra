import { redirect } from 'next/navigation';

/**
 * Canonical admin entry: authenticated users land on the dashboard.
 * Authorization is enforced by `AdminShell` (UX) and by every
 * `/api/v1/admin/*` endpoint (security authority).
 */
export default function AdminEntryPage() {
  redirect('/admin/dashboard');
}
