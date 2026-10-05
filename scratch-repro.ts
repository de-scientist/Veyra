/* Scratch reproduction: product-creation 400s. DELETE AFTER USE. */
import { readFileSync } from 'node:fs';

for (const line of readFileSync('./.env', 'utf8').split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && !process.env[key.trim()]) process.env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
}

const PRODUCT_ID = '8d139ca8-afe8-4c68-a7da-e878cd68bc7d';

async function main() {
  const { buildApp } = await import('./apps/api/src/app.js');
  const { prisma } = await import('./apps/api/src/lib/prisma.js');

  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    include: { category: { select: { id: true, name: true, slug: true, code: true, skuTemplate: true } } },
  });
  console.log('PRODUCT:', product ? { id: product.id, name: product.name, status: product.status, category: product.category } : 'NOT FOUND');

  const app = await buildApp();

  const primary = await app.inject({
    method: 'POST',
    url: `/api/v1/admin/products/${PRODUCT_ID}/images/658d754e-16dd-4217-a29a-62e43c2d20a5/primary`,
    headers: { 'content-type': 'application/json' },
  });
  console.log('PRIMARY (empty JSON body):', primary.statusCode, primary.body?.slice(0, 500));

  const preflight = await app.inject({
    method: 'OPTIONS',
    url: `/api/v1/admin/products/${PRODUCT_ID}/collections`,
    headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'PUT' },
  });
  console.log('PREFLIGHT PUT:', preflight.statusCode, JSON.stringify(preflight.headers['access-control-allow-methods']));

  await app.close();
  await prisma.$disconnect();
}

void main();
