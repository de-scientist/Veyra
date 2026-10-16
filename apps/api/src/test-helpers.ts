import { prisma } from './lib/prisma.js';

/**
 * Test-only RBAC fixture helper. Grants ride on a suite-scoped role
 * (`testgrants-<key>`), so suites never mutate the canonical admin/staff/
 * customer roles and cannot interfere with parallel suites. Pass each suite's
 * unique stamp as `key` and call `cleanupTestGrantRole(key)` in `afterAll`.
 */
export async function grantTestPermissions(userId: string, key: string, slugs: string[]) {
  const slug = `testgrants-${key}`;
  const role = await prisma.role.upsert({
    where: { slug },
    update: {},
    create: { name: slug, slug },
  });
  for (const permSlug of slugs) {
    const [resource, action] = permSlug.split('.');
    const permission = await prisma.permission.upsert({
      where: { slug: permSlug },
      update: {},
      create: { name: permSlug, slug: permSlug, resource, action },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });
  return role;
}

export async function cleanupTestGrantRole(key: string) {
  const role = await prisma.role.findUnique({ where: { slug: `testgrants-${key}` } });
  if (!role) return;
  await prisma.userRole.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.role.delete({ where: { id: role.id } });
}
