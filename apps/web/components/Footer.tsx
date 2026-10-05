import Link from 'next/link';

import { JBLogo } from './JBLogo';
import { departments } from '../lib/catalog';
import { getCollections } from '../lib/storefront';

export async function Footer() {
  // Live collections; footer degrades to departments alone on API failure.
  // Only routes that exist are linked — no invented legal, contact, or FAQ
  // pages. Authoritative phone/email are UNKNOWN (see business register),
  // so no contact number is displayed rather than inventing one.
  const collections = await getCollections().catch(() => []);
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <p className="brand brand--small site-footer__brand">
            <JBLogo variant="compact" alt="JB Mercantile" height={30} />
          </p>
          <p className="site-footer__tagline">Fashion • Footwear • Kitchen &amp; Home</p>
          <p>Everyday essentials designed for Kenya and delivered with care. Secure checkout with M-Pesa support.</p>
        </div>
        <nav aria-label="Shop">
          <h4>Shop</h4>
          <ul>
            <li><Link href="/shop">All products</Link></li>
            {departments.map((department) => (
              <li key={department.slug}>
                <Link href={`/shop?department=${department.slug}`}>{department.name}</Link>
              </li>
            ))}
            {collections.slice(0, 3).map((collection) => (
              <li key={collection.slug}>
                <Link href={`/collections/${collection.slug}`}>{collection.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Customer service">
          <h4>Customer service</h4>
          <ul>
            <li><Link href="/account/orders">Orders &amp; tracking</Link></li>
            <li><Link href="/returns">Returns &amp; exchanges</Link></li>
            <li><Link href="/search">Search products</Link></li>
            <li><Link href="/checkout">Checkout</Link></li>
          </ul>
        </nav>
        <nav aria-label="Account">
          <h4>Account</h4>
          <ul>
            <li><Link href="/account">My account</Link></li>
            <li><Link href="/account/profile">Profile</Link></li>
            <li><Link href="/wishlist">Wishlist</Link></li>
            <li><Link href="/cart">Cart</Link></li>
          </ul>
        </nav>
      </div>
      <div className="site-footer__bottom">
        <div className="container site-footer__bottom-inner">
          <span>© {new Date().getFullYear()} JB Mercantile. All rights reserved.</span>
          <span>Kenya · Secure checkout · M-Pesa supported</span>
        </div>
      </div>
    </footer>
  );
}
