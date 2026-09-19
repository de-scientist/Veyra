import Image from 'next/image';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <p className="brand brand--small site-footer__brand">
            <Image src="/jb-logo.png" alt="" width={28} height={28} />
            <span>JB</span>
          </p>
          <p>Modern, premium everyday clothing — designed for Kenya, delivered with care.</p>
        </div>
        <nav aria-label="Explore">
          <h4>Explore</h4>
          <ul>
            <li><Link href="/shop">Shop all</Link></li>
            <li><Link href="/search">Search</Link></li>
            <li><Link href="/collections/weekend-edit">Collections</Link></li>
            <li><Link href="/wishlist">Wishlist</Link></li>
          </ul>
        </nav>
        <nav aria-label="Support">
          <h4>Support</h4>
          <ul>
            <li><Link href="/account">Account</Link></li>
            <li><Link href="/account/orders">Orders &amp; tracking</Link></li>
            <li><Link href="/returns">Returns &amp; exchanges</Link></li>
            <li><Link href="/cart">Cart</Link></li>
          </ul>
        </nav>
      </div>
      <div className="site-footer__bottom">
        <div className="container site-footer__bottom" style={{ padding: 0 }}>
          <span>© {new Date().getFullYear()} JB. All rights reserved.</span>
          <span>Secure checkout · M-Pesa supported</span>
        </div>
      </div>
    </footer>
  );
}
