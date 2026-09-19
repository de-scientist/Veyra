import Link from 'next/link';

import { JBLogo } from './JBLogo';
import { collections, departments } from '../lib/catalog';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <p className="brand brand--small site-footer__brand">
            <JBLogo size={30} descriptor={null} />
          </p>
          <p>JB Mercantile — fashion, footwear and kitchen &amp; home essentials, designed for Kenya and delivered with care.</p>
        </div>
        <nav aria-label="Shop departments">
          <h4>Shop</h4>
          <ul>
            <li><Link href="/shop">All products</Link></li>
            {departments.map((department) => (
              <li key={department.slug}>
                <Link href={`/shop?department=${department.slug}`}>{department.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Collections">
          <h4>Collections</h4>
          <ul>
            {collections.slice(0, 4).map((collection) => (
              <li key={collection.slug}>
                <Link href={`/collections/${collection.slug}`}>{collection.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Support">
          <h4>Support</h4>
          <ul>
            <li><Link href="/account">Account</Link></li>
            <li><Link href="/account/orders">Orders &amp; tracking</Link></li>
            <li><Link href="/returns">Returns &amp; exchanges</Link></li>
            <li><Link href="/search">Search</Link></li>
          </ul>
        </nav>
      </div>
      <div className="site-footer__bottom">
        <div className="container site-footer__bottom" style={{ padding: 0 }}>
          <span>© {new Date().getFullYear()} JB Mercantile. All rights reserved.</span>
          <span>Secure checkout · M-Pesa supported</span>
        </div>
      </div>
    </footer>
  );
}
