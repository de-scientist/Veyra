'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccountDashboard, type DashboardData, type AccountOrder, type OrderSummary } from '../../lib/shopping-api';
import { PriceDisplay } from '../../components/PriceDisplay';

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(amount: number, currency = 'KES') {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace(/_/g, ' ');
  const colors: Record<string, string> = {
    paid: '#1f6b45',
    completed: '#1f6b45',
    delivered: '#1f6b45',
    pending: '#7c5a45',
    confirmed: '#7c5a45',
    processing: '#7c5a45',
    unpaid: '#b84d4d',
    failed: '#b84d45',
    cancelled: '#b84d45',
    refunded: '#7c5a45',
    'partially refunded': '#7c5a45',
    unfulfilled: '#5f5a55',
    packed: '#7c5a45',
    shipped: '#7c5a45',
    'out for delivery': '#7c5a45',
    'delivery attempted': '#b84d45',
    'ready for pickup': '#7c5a45',
    'picked up': '#1f6b45',
    returned: '#5f5a55',
  };
  const color = colors[normalized] || '#5f5a55';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.25rem 0.6rem',
        borderRadius: '999px',
        fontSize: '0.7rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        background: `${color}15`,
        color,
      }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function OrderCard({ order }: { order: OrderSummary }) {
  return (
    <article className="account-order-card">
      <div className="account-order-card__header">
        <div>
          <Link href={`/account/orders/${order.orderNumber}`} className="account-order-link">
            <strong>{order.orderNumber}</strong>
          </Link>
          <span className="account-order-date">{formatDate(order.createdAt)}</span>
        </div>
        <div className="account-order-card__totals">
          <PriceDisplay price={order.grandTotal} />
          <StatusBadge status={order.status} />
        </div>
      </div>
      <div className="account-order-card__meta">
        <div className="account-order-card__statuses">
          <span><strong>Payment:</strong> {order.paymentStatus}</span>
          <span><strong>Fulfillment:</strong> {order.fulfillmentStatus}</span>
        </div>
        <span className="account-order-card__count">{order.itemCount} item{order.itemCount !== 1 ? 's' : ''}</span>
      </div>
    </article>
  );
}

function CurrentOrderCard({ order }: { order: AccountOrder | null }) {
  if (!order) return null;

  return (
    <section className="account-section">
      <div className="section-heading">
        <h2>Current Order</h2>
      </div>
      <article className="account-current-order">
        <div className="account-current-order__header">
          <div>
            <Link href={`/account/orders/${order.orderNumber}`} className="account-order-link">
              <strong>{order.orderNumber}</strong>
            </Link>
            <span className="account-order-date">{formatDate(order.createdAt)}</span>
          </div>
          <div className="account-current-order__actions">
            <Link href={`/account/orders/${order.orderNumber}`} className="button button--secondary">View Details</Link>
            <Link href={`/account/orders/${order.orderNumber}/tracking`} className="button">Track Order</Link>
          </div>
        </div>
        <div className="account-current-order__statuses">
          <div><strong>Order Status:</strong> <StatusBadge status={order.status} /></div>
          <div><strong>Payment:</strong> <StatusBadge status={order.paymentStatus} /></div>
          <div><strong>Fulfillment:</strong> <StatusBadge status={order.fulfillmentStatus} /></div>
        </div>
        {order.delivery && (
          <div className="account-current-order__delivery">
            <strong>Delivery:</strong> {order.delivery.method?.name} — {order.delivery.status}
            {order.delivery.trackingNumber && <span> • Tracking: {order.delivery.trackingNumber}</span>}
            {order.delivery.estimatedDeliveryAt && <span> • Est. {formatDate(order.delivery.estimatedDeliveryAt)}</span>}
          </div>
        )}
        <div className="account-current-order__total">
          <strong>Total:</strong> <PriceDisplay price={order.grandTotal} />
        </div>
      </article>
    </section>
  );
}

function RecentOrdersSection({ orders }: { orders: OrderSummary[] }) {
  if (!orders.length) return null;

  return (
    <section className="account-section">
      <div className="section-heading">
        <h2>Recent Orders</h2>
        <Link href="/account/orders" className="text-button">View all</Link>
      </div>
      <div className="account-orders-list">
        {orders.map((order) => (
          <OrderCard key={order.orderNumber} order={order} />
        ))}
      </div>
    </section>
  );
}

function WishlistSection({ wishlist }: { wishlist: DashboardData['wishlist'] }) {
  if (!wishlist || !wishlist.count) return null;

  return (
    <section className="account-section">
      <div className="section-heading">
        <h2>Wishlist</h2>
        <Link href="/wishlist" className="text-button">View all</Link>
      </div>
      <div className="wishlist-grid">
        {wishlist.items.slice(0, 4).map((item) => (
          <Link key={item.productId} href={`/products/${item.product.slug}`} className="wishlist-item">
            {item.product.image ? (
              <img src={item.product.image} alt="" />
            ) : (
              <div className="cart-item__placeholder">No image</div>
            )}
            <div className="wishlist-item__body">
              <h2>{item.product.name}</h2>
              <p className="muted-copy">{item.product.availability}</p>
              <PriceDisplay price={item.product.price} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ReturnsRefundsSection({ activeReturns, recentRefunds }: { activeReturns: DashboardData['activeReturns']; recentRefunds: DashboardData['recentRefunds'] }) {
  const hasContent = (activeReturns?.count ?? 0) > 0 || (recentRefunds?.count ?? 0) > 0;
  if (!hasContent) return null;

  return (
    <section className="account-section">
      <div className="section-heading">
        <h2>Returns & Refunds</h2>
        <Link href="/account/returns" className="text-button">View all</Link>
      </div>
      <div className="account-returns-refunds">
        {activeReturns && activeReturns.count > 0 && (
          <div className="account-summary-card">
            <h3>Active Returns ({activeReturns.count})</h3>
            {activeReturns.latest && (
              <div className="account-return-preview">
                <Link href={`/account/returns`} className="account-order-link">
                  {activeReturns.latest.returnNumber} — {activeReturns.latest.status}
                </Link>
                <span className="muted-copy">{activeReturns.latest.items.length} item(s)</span>
              </div>
            )}
          </div>
        )}
        {recentRefunds && recentRefunds.count > 0 && (
          <div className="account-summary-card">
            <h3>Recent Refunds ({recentRefunds.count})</h3>
            {recentRefunds.latest && (
              <div className="account-refund-preview">
                <span className="muted-copy">Order {recentRefunds.latest.orderNumber}</span>
                <PriceDisplay price={recentRefunds.latest.amount} />
                <StatusBadge status={recentRefunds.latest.status} />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function QuickLinks() {
  const links = [
    { href: '/account/profile', label: 'Edit Profile', icon: '👤' },
    { href: '/account/addresses', label: 'Manage Addresses', icon: '📍' },
    { href: '/account/orders', label: 'Order History', icon: '📦' },
    { href: '/account/wishlist', label: 'Wishlist', icon: '❤️' },
    { href: '/account/security', label: 'Security', icon: '🔒' },
    { href: '/account/preferences', label: 'Preferences', icon: '⚙️' },
  ];

  return (
    <section className="account-section">
      <h2 className="eyebrow">Quick Links</h2>
      <div className="account-quick-links">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="account-quick-link">
            <span className="account-quick-link-icon" aria-hidden="true">{link.icon}</span>
            <span>{link.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function AccountDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getAccountDashboard()
      .then((d) => {
        if (mounted) setData(d);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="empty-state"><p>Loading your account…</p></div>;
  if (error) return <div className="empty-state"><h1>Unable to load account</h1><p>{error}</p></div>;
  if (!data) return <div className="empty-state"><h1>No account data</h1></div>;

  const { profile, orderSummary, currentOrder, recentOrders, wishlist, activeReturns, recentRefunds } = data;

  return (
    <div className="account-dashboard">
      <header className="account-dashboard__header">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h1>{profile.firstName} {profile.lastName}</h1>
        </div>
        <Link href="/shop" className="button">Continue Shopping</Link>
      </header>

      <section className="account-section account-summary">
        <div className="account-summary-grid">
          <div className="account-summary-card">
            <p className="eyebrow">Total Orders</p>
            <p className="account-summary-value">{orderSummary.totalOrders}</p>
          </div>
          <div className="account-summary-card">
            <p className="eyebrow">Active Orders</p>
            <p className="account-summary-value">{orderSummary.activeOrders}</p>
          </div>
          <div className="account-summary-card">
            <p className="eyebrow">Delivered</p>
            <p className="account-summary-value">{orderSummary.deliveredOrders}</p>
          </div>
          <div className="account-summary-card">
            <p className="eyebrow">Processing</p>
            <p className="account-summary-value">{orderSummary.processingOrders}</p>
          </div>
        </div>
      </section>

      <CurrentOrderCard order={currentOrder} />
      <RecentOrdersSection orders={recentOrders} />
      <WishlistSection wishlist={wishlist} />
      <ReturnsRefundsSection activeReturns={activeReturns} recentRefunds={recentRefunds} />
      <QuickLinks />
    </div>
  );
}