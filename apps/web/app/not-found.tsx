import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="container page-shell not-found">
      <p className="eyebrow">404</p>
      <h1>We could not find that page.</h1>
      <p>The product, collection, or category you are looking for may have moved or no longer be available.</p>
      <div className="cta-row">
        <Link href="/shop" className="button">Browse the shop</Link>
        <Link href="/" className="button button--secondary">Return home</Link>
      </div>
    </main>
  );
}
