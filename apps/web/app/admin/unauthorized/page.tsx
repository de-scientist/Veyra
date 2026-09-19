import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Not authorized | JB Mercantile',
  description: 'You do not have permission to access the JB Mercantile operations area.',
  robots: { index: false, follow: false },
};

/**
 * 403 experience for authenticated users without dashboard permission.
 * Rendered WITHOUT the AdminShell session gate (the shell bypasses its
 * redirect for this path) so authorized-logged-in-but-forbidden users land
 * here instead of looping on `/login`. No internals are exposed.
 */
export default function AdminUnauthorizedPage() {
  return (
    <main className="container page-shell">
      <div className="empty-state" role="alert" aria-live="assertive">
        <h1>403 — Not authorized</h1>
        <p>You do not have permission to access this area.</p>
        <p className="muted-copy">
          If you need operations access, ask your administrator to grant it to your account.
        </p>
        <p>
          <Link href="/" className="button button--secondary">Back to storefront</Link>{' '}
          <Link href="/account" className="button button--secondary">My account</Link>
        </p>
      </div>
    </main>
  );
}
