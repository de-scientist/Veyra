'use client';

import { useCallback, useEffect, useState } from 'react';

import { getAdminReviews, moderateReview, type Pagination } from '../../../lib/admin-api';
import { AdminEmptyState, AdminPagination, AdminStatusBadge, formatAdminDate } from '../../../components/admin';

const STATUSES = ['', 'PENDING', 'APPROVED', 'REJECTED'];

type ReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
  product: { id: string; name: string; slug: string };
  user: { id: string; email: string; firstName: string; lastName: string };
};

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState({ page: 1, pageSize: 20, search: '', status: 'PENDING' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminReviews({ page: params.page, pageSize: params.pageSize, search: params.search || undefined, status: params.status || undefined });
      setReviews(result.reviews as unknown as ReviewRow[]);
      setPagination(result.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  const handleModerate = async (id: string, status: string) => {
    if (!window.confirm(`Mark this review ${status}?`)) return;
    try {
      await moderateReview(id, { status });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Moderation failed');
    }
  };

  if (loading && reviews.length === 0) return <div className="empty-state"><p>Loading reviews…</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Reviews</h1>
          <p className="muted-copy">Moderate customer product reviews</p>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      <section className="account-filters">
        <div className="account-status-filters" role="group" aria-label="Review status">
          {STATUSES.map((status) => (
            <button key={status || 'all'} type="button" className={`account-filter-chip ${params.status === status ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, status }))}>
              {status || 'All'}
            </button>
          ))}
        </div>
      </section>

      {reviews.length === 0 ? (
        <AdminEmptyState title="No reviews" message="No reviews match the current filter." />
      ) : (
        <>
          {reviews.map((review) => (
            <article key={review.id} className="account-summary-card">
              <p><strong>{review.title ?? '(no title)'}</strong> — {review.rating}/5 <AdminStatusBadge status={review.status} /></p>
              <p>{review.body ?? '—'}</p>
              <p className="muted-copy">{review.product.name} • {review.user.firstName} {review.user.lastName}{review.isVerifiedPurchase ? ' • verified purchase' : ''} • {formatAdminDate(review.createdAt)}</p>
              <div className="account-actions">
                <button type="button" className="button button--secondary" onClick={() => handleModerate(review.id, 'APPROVED')}>Approve</button>
                <button type="button" className="button button--danger" onClick={() => handleModerate(review.id, 'REJECTED')}>Reject</button>
              </div>
            </article>
          ))}
          {pagination && <AdminPagination pagination={pagination} onPage={(page) => setParams((prev) => ({ ...prev, page }))} />}
        </>
      )}
    </div>
  );
}
