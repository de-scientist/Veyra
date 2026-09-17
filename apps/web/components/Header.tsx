import Link from 'next/link';

import { categories } from '../lib/storefront-data';

export function Header() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" className="brand" aria-label="Veyra home">
          VEYRA
        </Link>

        <nav aria-label="Main navigation" className="main-nav">
          <Link href="/shop">Shop</Link>
          {categories.slice(0, 3).map((category) => (
            <Link key={category.slug} href={`/categories/${category.slug}`}>
              {category.name}
            </Link>
          ))}
          <Link href="/search">Search</Link>
        </nav>

        <div className="header-actions">
          <Link href="/search" aria-label="Search products">
            Search
          </Link>
          <Link href="/account" aria-label="Account">
            Account
          </Link>
          <Link href="/cart" aria-label="Cart">
            Cart
          </Link>
        </div>
      </div>
    </header>
  );
}
