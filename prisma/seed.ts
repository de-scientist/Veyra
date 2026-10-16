import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { slug: 'admin' },
    update: {},
    create: {
      name: 'Admin',
      slug: 'admin',
    },
  });

  const staffRole = await prisma.role.upsert({
    where: { slug: 'staff' },
    update: {},
    create: {
      name: 'Staff',
      slug: 'staff',
    },
  });

  const customerRole = await prisma.role.upsert({
    where: { slug: 'customer' },
    update: {},
    create: {
      name: 'Customer',
      slug: 'customer',
    },
  });

  const superAdminRole = await prisma.role.upsert({
    where: { slug: 'super_admin' },
    update: {},
    create: {
      name: 'Super Admin',
      slug: 'super_admin',
    },
  });

  // Canonical permission catalogue. This list MUST stay in sync with PERMISSIONS in
  // apps/api/src/lib/permissions.ts — routes pick existing slugs from that catalog
  // instead of inventing new ones, and this seed is the authoritative store.
  // Additive-only: reruns upsert missing rows and never delete custom grants.
  const allPermissions = [
    { name: 'View Dashboard', slug: 'dashboard.read', resource: 'dashboard', action: 'read' },
    { name: 'Manage Products', slug: 'products.manage', resource: 'products', action: 'manage' },
    { name: 'Manage Inventory', slug: 'inventory.manage', resource: 'inventory', action: 'manage' },
    { name: 'Manage Categories', slug: 'categories.manage', resource: 'categories', action: 'manage' },
    { name: 'Manage Collections', slug: 'collections.manage', resource: 'collections', action: 'manage' },
    { name: 'Manage Orders', slug: 'orders.manage', resource: 'orders', action: 'manage' },
    { name: 'View Fulfillment', slug: 'fulfillment.view', resource: 'fulfillment', action: 'read' },
    { name: 'Process Fulfillment', slug: 'fulfillment.process', resource: 'fulfillment', action: 'manage' },
    { name: 'Manage Delivery', slug: 'delivery.manage', resource: 'delivery', action: 'manage' },
    { name: 'Process Refunds', slug: 'refunds.process', resource: 'refunds', action: 'manage' },
    { name: 'View Customers', slug: 'customers.read', resource: 'customers', action: 'read' },
    { name: 'Manage Customers', slug: 'customers.manage', resource: 'customers', action: 'manage' },
    { name: 'Manage Users', slug: 'users.manage', resource: 'users', action: 'manage' },
    { name: 'Manage Roles', slug: 'roles.manage', resource: 'roles', action: 'manage' },
    { name: 'View Audit Logs', slug: 'audit.read', resource: 'audit', action: 'read' },
    { name: 'View Notifications', slug: 'notifications.read', resource: 'notifications', action: 'read' },
    { name: 'Manage Notifications', slug: 'notifications.manage', resource: 'notifications', action: 'manage' },
    { name: 'View Analytics', slug: 'analytics.read', resource: 'analytics', action: 'read' },
    { name: 'Manage Settings', slug: 'settings.manage', resource: 'settings', action: 'manage' },
  ];

  // Least-privilege default grants (managed defaults for fresh installs).
  // Admin: operational management incl. the already Fin-authorized refund completion.
  // Never role/permission administration (users.manage, roles.manage) or system
  // settings (settings.manage) — those stay super-admin-only by route guard.
  const adminPermissionSlugs = [
    'dashboard.read',
    'products.manage',
    'inventory.manage',
    'categories.manage',
    'collections.manage',
    'orders.manage',
    'fulfillment.view',
    'fulfillment.process',
    'delivery.manage',
    'refunds.process',
    'customers.read',
    'customers.manage',
    'audit.read',
    'notifications.read',
    'notifications.manage',
    'analytics.read',
  ];

  // Staff: strictly inventory, orders and fulfillment (+ read-only dashboard).
  // No catalogue/taxonomy management, no refunds, no customer administration,
  // no analytics/media/settings, no role administration.
  const staffPermissionSlugs = [
    'dashboard.read',
    'inventory.manage',
    'orders.manage',
    'fulfillment.view',
    'fulfillment.process',
    'delivery.manage',
  ];

  for (const permission of allPermissions) {
    await prisma.permission.upsert({
      where: { slug: permission.slug },
      update: {},
      create: permission,
    });
  }

  async function grantPermissions(roleId: string, slugs: string[]) {
    const permissionRecords = await prisma.permission.findMany({
      where: { slug: { in: slugs } },
    });
    for (const permission of permissionRecords) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId,
          permissionId: permission.id,
        },
      });
    }
  }

  await grantPermissions(adminRole.id, adminPermissionSlugs);
  // Super-admin resolves to the platform wildcard in code regardless of rows;
  // mirroring the admin grant set keeps the directory listing truthful.
  await grantPermissions(superAdminRole.id, adminPermissionSlugs);
  await grantPermissions(staffRole.id, staffPermissionSlugs);

  const passwordHash = await bcrypt.hash('Admin123!', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@veyra.local' },
    update: {},
    create: {
      email: 'admin@veyra.local',
      passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      status: 'ACTIVE',
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  await prisma.category.upsert({
    where: { slug: 'apparel' },
    update: {},
    create: {
      name: 'Apparel',
      slug: 'apparel',
      description: 'Core apparel collection',
      status: 'ACTIVE',
    },
  });

  await prisma.shippingZone.upsert({
    where: { code: 'KE-NAIROBI' },
    update: {},
    create: {
      name: 'Nairobi',
      code: 'KE-NAIROBI',
      country: 'KE',
      status: 'ACTIVE',
      description: 'Development shipping zone',
    },
  });

  const shippingZone = await prisma.shippingZone.findUniqueOrThrow({ where: { code: 'KE-NAIROBI' } });
  const courierMethod = await prisma.shippingMethod.upsert({
    where: { code: 'COURIER' },
    update: {},
    create: {
      name: 'Courier',
      code: 'COURIER',
      type: 'COURIER',
      status: 'ACTIVE',
    },
  });

  await prisma.shippingRate.upsert({
    where: {
      zoneId_methodId: {
        zoneId: shippingZone.id,
        methodId: courierMethod.id,
      },
    },
    update: {},
    create: {
      zoneId: shippingZone.id,
      methodId: courierMethod.id,
      basePrice: 500,
      minOrderValue: 0,
      status: 'ACTIVE',
    },
  });

  console.log('Seed complete');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
