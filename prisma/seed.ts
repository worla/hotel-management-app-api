import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');
  
  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@hotel.com' }
  });

  if (existingAdmin) {
    console.log('⚠️  Admin user already exists');
    return;
  }

  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  const admin = await prisma.user.create({
    data: {
      email: 'admin@hotel.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'ADMIN',
    },
  });

  console.log('✅ Admin user created successfully!');
  console.log('   Email:', admin.email);
  console.log('   Password: admin123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
// import { PrismaClient } from '@prisma/client';
// import * as bcrypt from 'bcrypt';

// const prisma = new PrismaClient();

// async function main() {
//   const hashedPassword = await bcrypt.hash('admin123', 10);
  
//   await prisma.user.create({
//     data: {
//       email: 'admin@hotel.com',
//       password: hashedPassword,
//       name: 'Admin User',
//       role: 'ADMIN',
//     },
//   });

//   // Create some sample rooms
//   await prisma.room.createMany({
//     data: [
//       { roomNumber: '101', roomType: 'Single', pricePerDay: 50, status: 'AVAILABLE' },
//       { roomNumber: '102', roomType: 'Double', pricePerDay: 80, status: 'AVAILABLE' },
//       { roomNumber: '201', roomType: 'Suite', pricePerDay: 150, status: 'AVAILABLE' },
//     ],
//   });
// }

// main()
//   .catch((e) => console.error(e))
//   .finally(async () => await prisma.$disconnect());