import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import Admin from './models/Admin.js';
import Collection from './models/Collection.js';
import Product from './models/Product.js';

async function run() {
  await connectDB();

  // Admin
  const email = process.env.ADMIN_EMAIL || 'admin@underdawg.com';
  const existing = await Admin.findOne({ email });
  if (!existing) {
    await Admin.create({
      name: process.env.ADMIN_NAME || 'Admin',
      email,
      password: process.env.ADMIN_PASSWORD || 'admin12345',
      role: 'superadmin',
    });
    console.log(`[seed] Created admin: ${email}`);
  } else {
    console.log(`[seed] Admin already exists: ${email}`);
  }

  // Wipe existing sample data
  await Collection.deleteMany({});
  await Product.deleteMany({});

  // Collections
  const collections = await Collection.insertMany([
    { title: 'Caps', eyebrow: 'Accessories', order: 1, isFeatured: true },
    { title: 'Polo Club', eyebrow: 'Summer Edit', order: 2, isFeatured: true },
    { title: 'Winter 25', eyebrow: 'Seasonal', order: 3, isFeatured: true },
    { title: 'Racing Club', eyebrow: 'Capsule', order: 4, isFeatured: true },
    { title: 'Basics', eyebrow: 'Everyday', order: 5, isFeatured: true },
    { title: 'Yacht Club', eyebrow: 'Resort', order: 6, isFeatured: true },
  ]);
  console.log(`[seed] Created ${collections.length} collections`);

  const byTitle = Object.fromEntries(collections.map((c) => [c.title, c._id]));

  // Products (using picsum placeholders - replace with real uploads via admin panel)
  const products = [
    {
      title: 'Walking Leaf T-Shirt',
      price: 5400,
      category: 'tshirts',
      images: ['https://picsum.photos/seed/p1a/600/800', 'https://picsum.photos/seed/p1b/600/800'],
      colors: ['Black', 'White'],
      variants: [{ size: 'S', stock: 10 }, { size: 'M', stock: 15 }, { size: 'L', stock: 8 }, { size: 'XL', stock: 5 }],
      collections: [byTitle['Basics']],
      isFeatured: true, isNew: true,
    },
    {
      title: 'Dark Crest T-Shirt',
      price: 6800,
      category: 'tshirts',
      images: ['https://picsum.photos/seed/p2a/600/800', 'https://picsum.photos/seed/p2b/600/800'],
      variants: [{ size: 'S', stock: 8 }, { size: 'M', stock: 12 }, { size: 'L', stock: 10 }],
      collections: [byTitle['Basics']],
      isFeatured: true, isNew: true,
    },
    {
      title: 'Glacial Blue Ladybird Tee',
      price: 3700, compareAtPrice: 5400,
      category: 'tshirts',
      images: ['https://picsum.photos/seed/p3a/600/800', 'https://picsum.photos/seed/p3b/600/800'],
      variants: [{ size: 'M', stock: 4 }, { size: 'L', stock: 6 }],
      collections: [byTitle['Basics']],
      isFeatured: true, isNew: true,
    },
    {
      title: 'Black Ladybird T-Shirt',
      price: 5200,
      category: 'tshirts',
      images: ['https://picsum.photos/seed/p4a/600/800', 'https://picsum.photos/seed/p4b/600/800'],
      variants: [{ size: 'S', stock: 3 }, { size: 'M', stock: 8 }, { size: 'L', stock: 9 }],
      collections: [byTitle['Basics']],
      isFeatured: true, isNew: true,
    },
    {
      title: 'Rust and Beige Cap',
      price: 3200,
      category: 'caps',
      images: ['https://picsum.photos/seed/cap1a/600/800', 'https://picsum.photos/seed/cap1b/600/800'],
      variants: [{ size: 'One Size', stock: 20 }],
      collections: [byTitle['Caps']],
    },
    {
      title: 'Olive and Rose Cap',
      price: 3200,
      category: 'caps',
      images: ['https://picsum.photos/seed/cap2a/600/800', 'https://picsum.photos/seed/cap2b/600/800'],
      variants: [{ size: 'One Size', stock: 15 }],
      collections: [byTitle['Caps']],
    },
    {
      title: 'Black Wildloom Hoodie',
      price: 23000,
      category: 'hoodies',
      images: ['https://picsum.photos/seed/w1a/600/800', 'https://picsum.photos/seed/w1b/600/800'],
      variants: [{ size: 'S', stock: 2 }, { size: 'M', stock: 3 }, { size: 'L', stock: 2 }],
      collections: [byTitle['Winter 25']],
      isFeatured: true,
    },
    {
      title: 'Brown Wildloom Hoodie',
      price: 23000,
      category: 'hoodies',
      images: ['https://picsum.photos/seed/w2a/600/800', 'https://picsum.photos/seed/w2b/600/800'],
      variants: [{ size: 'M', stock: 3 }, { size: 'L', stock: 4 }, { size: 'XL', stock: 2 }],
      collections: [byTitle['Winter 25']],
      isFeatured: true,
    },
    {
      title: 'Boxy Mustard Jacket',
      price: 13000,
      category: 'jackets',
      images: ['https://picsum.photos/seed/w4a/600/800', 'https://picsum.photos/seed/w4b/600/800'],
      variants: [{ size: 'M', stock: 5 }, { size: 'L', stock: 4 }],
      collections: [byTitle['Winter 25']],
    },
    {
      title: 'Brown Puffer Jacket',
      price: 35000,
      category: 'jackets',
      images: ['https://picsum.photos/seed/w6a/600/800', 'https://picsum.photos/seed/w6b/600/800'],
      variants: [{ size: 'S', stock: 2 }, { size: 'M', stock: 3 }, { size: 'L', stock: 1 }],
      collections: [byTitle['Winter 25']],
    },
    {
      title: 'Racing Club Polo',
      price: 4200,
      category: 'polos',
      images: ['https://picsum.photos/seed/r1a/600/800', 'https://picsum.photos/seed/r1b/600/800'],
      variants: [{ size: 'S', stock: 8 }, { size: 'M', stock: 10 }, { size: 'L', stock: 7 }],
      collections: [byTitle['Polo Club'], byTitle['Racing Club']],
    },
    {
      title: 'Navy Summer Shorts',
      price: 2800,
      category: 'shorts',
      images: ['https://picsum.photos/seed/s1a/600/800', 'https://picsum.photos/seed/s1b/600/800'],
      variants: [{ size: 'S', stock: 6 }, { size: 'M', stock: 9 }, { size: 'L', stock: 5 }],
      collections: [byTitle['Yacht Club']],
    },
  ];

  await Product.insertMany(products);
  console.log(`[seed] Created ${products.length} products`);

  await mongoose.disconnect();
  console.log('[seed] Done');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
