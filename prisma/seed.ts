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

  const adminPermissions = [
    { name: 'Manage Products', slug: 'products.manage', resource: 'products', action: 'manage' },
    { name: 'Manage Inventory', slug: 'inventory.manage', resource: 'inventory', action: 'manage' },
    { name: 'Manage Categories', slug: 'categories.manage', resource: 'categories', action: 'manage' },
    { name: 'Manage Collections', slug: 'collections.manage', resource: 'collections', action: 'manage' },
    { name: 'Manage Orders', slug: 'orders.manage', resource: 'orders', action: 'manage' },
    { name: 'View Audit Logs', slug: 'audit.read', resource: 'audit', action: 'read' },
  ];

  for (const permission of adminPermissions) {
    await prisma.permission.upsert({
      where: { slug: permission.slug },
      update: {},
      create: permission,
    });
  }

  const permissionRecords = await prisma.permission.findMany({
    where: {
      slug: {
        in: adminPermissions.map((item) => item.slug),
      },
    },
  });

  for (const permission of permissionRecords) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
    });
  }

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: staffRole.id,
        permissionId: permissionRecords.find((permission) => permission.slug === 'products.manage')?.id ?? '',
      },
    },
    update: {},
    create: {
      roleId: staffRole.id,
      permissionId: permissionRecords.find((permission) => permission.slug === 'products.manage')?.id ?? '',
    },
  });

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
