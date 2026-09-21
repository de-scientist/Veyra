import { readFileSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const file = process.argv[2];

async function main() {
  const raw = readFileSync(file, 'utf8');
  const uncommented = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const statements = uncommented
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(`${statement};`);
    console.log('applied:', statement.slice(0, 90));
  }
  const columns: Array<{ column_name: string }> = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'User' AND column_name IN ('avatarUrl', 'avatarPublicId')`;
  console.log('columns:', columns.map((c) => c.column_name).join(','));
}

main()
  .catch((e) => {
    console.error('MIGRATE_FAILED', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
