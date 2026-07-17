import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminPwd = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@oj.local',
      passwordHash: adminPwd,
      role: 'ADMIN',
    },
  });

  const aPlusB = await prisma.problem.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      title: 'A + B Problem',
      description:
        '# A + B Problem\n\n读入两个整数 a, b,输出 a + b。\n\n## 输入\n一行,两个整数 a 和 b,空格分隔。\n\n## 输出\n一行,a + b 的值。\n\n## 样例\n输入:`1 2`\n输出:`3`',
      difficulty: 1,
      timeLimit: 1000,
      memoryLimit: 256,
      tags: ['入门', '数学'],
    },
  });
  await prisma.testcase.deleteMany({ where: { problemId: aPlusB.id } });
  await prisma.testcase.createMany({
    data: [
      { problemId: aPlusB.id, input: '1 2\n', expectedOutput: '3\n', isSample: true },
      { problemId: aPlusB.id, input: '100 200\n', expectedOutput: '300\n' },
      { problemId: aPlusB.id, input: '-5 5\n', expectedOutput: '0\n' },
    ],
  });

  const hello = await prisma.problem.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      title: 'Hello, World',
      description: '输出一行 `Hello, World!`。',
      difficulty: 1,
      timeLimit: 1000,
      memoryLimit: 256,
      tags: ['入门'],
    },
  });
  await prisma.testcase.deleteMany({ where: { problemId: hello.id } });
  await prisma.testcase.createMany({
    data: [{ problemId: hello.id, input: '', expectedOutput: 'Hello, World!\n', isSample: true }],
  });

  console.log('seed done.');
}

main().finally(() => prisma.$disconnect());
