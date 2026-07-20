import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Setting from '../models/Setting.js';
import Blog from '../models/Blog.js';

const run = async () => {
  await connectDB();
  console.log('🌱 Seeding database...');

  // Admin
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@etrade.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@12345';
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: 'Administrator',
      email: adminEmail,
      password: adminPass,
      role: 'admin',
    });
    console.log(`✅ Admin created: ${adminEmail} / ${adminPass}`);
  } else {
    console.log(`ℹ️  Admin exists: ${adminEmail}`);
  }

  // Categories
  const cats = [
    { name: 'Phones', icon: 'Smartphone', sortOrder: 1 },
    { name: 'Computers', icon: 'Monitor', sortOrder: 2 },
    { name: 'Accessories', icon: 'Headphones', sortOrder: 3 },
    { name: 'Laptops', icon: 'Laptop', sortOrder: 4 },
    { name: 'Monitors', icon: 'MonitorSpeaker', sortOrder: 5 },
    { name: 'Networking', icon: 'Wifi', sortOrder: 6 },
    { name: 'PC Gaming', icon: 'Gamepad2', sortOrder: 7 },
  ];
  const catDocs = {};
  for (const c of cats) {
    let cat = await Category.findOne({ name: c.name });
    if (!cat) cat = await Category.create(c);
    catDocs[c.name] = cat;
  }
  console.log('✅ Categories seeded');

  // Products
  const img = (seed) => `https://picsum.photos/seed/${seed}/600/600`;
  const sampleProducts = [
    {
      name: 'Roco Wireless Headphone Pro',
      shortDescription: 'Premium noise-cancelling over-ear headphones.',
      description: 'Immerse yourself in studio-quality sound with Roco Wireless Headphone Pro. Active noise cancellation, 40-hour battery, and plush memory-foam ear cushions.',
      brand: 'Roco',
      category: catDocs['Accessories']._id,
      images: [img('headphone1'), img('headphone2'), img('headphone3')],
      price: 4999, comparePrice: 6999, stock: 45, isFeatured: true, isBestSeller: true, isNewArrival: true,
      tags: ['headphone', 'wireless', 'audio'],
      specifications: [
        { key: 'Battery', value: '40 hours' },
        { key: 'Bluetooth', value: '5.3' },
        { key: 'Weight', value: '280g' },
      ],
    },
    {
      name: 'Elite RGB Mechanical Keyboard',
      shortDescription: 'Cherry MX switches, full RGB lighting.',
      description: 'Premium mechanical keyboard with Cherry MX Red switches, per-key RGB, hot-swappable, and a detachable USB-C cable.',
      brand: 'Elite', category: catDocs['PC Gaming']._id,
      images: [img('keyboard1'), img('keyboard2')],
      price: 7499, comparePrice: 9999, stock: 20, isFeatured: true, isNewArrival: true,
      tags: ['keyboard', 'gaming', 'mechanical'],
    },
    {
      name: 'Logitech Streamcam Pro 4K',
      shortDescription: '4K webcam with AI tracking.',
      description: 'Crystal-clear 4K streaming with intelligent auto-framing and dual-mic noise reduction.',
      brand: 'Logitech', category: catDocs['Computers']._id,
      images: [img('webcam1'), img('webcam2')],
      price: 12999, comparePrice: 15999, stock: 15, isFeatured: true,
      tags: ['webcam', 'streaming'],
    },
    {
      name: '2.1 Wireless Bookshelf Speakers',
      shortDescription: 'Rich bass, wireless streaming.',
      description: 'Premium 2.1 speaker system with deep bass, Bluetooth 5.0, and optical input.',
      brand: 'Sonora', category: catDocs['Accessories']._id,
      images: [img('speaker1'), img('speaker2')],
      price: 8499, comparePrice: 11999, stock: 30, isFeatured: true, isBestSeller: true,
      tags: ['speakers', 'audio'],
    },
    {
      name: 'Bose Meshi Clarity Smart Speaker',
      shortDescription: 'Voice-controlled smart speaker.',
      description: 'Room-filling 360° sound with built-in voice assistant and multi-room pairing.',
      brand: 'Bose', category: catDocs['Accessories']._id,
      images: [img('smartspeaker1')],
      price: 14999, comparePrice: 17999, stock: 12, isNewArrival: true,
      tags: ['smart', 'speaker'],
    },
    {
      name: 'Mira Logitech Wireless Mouse',
      shortDescription: 'Ergonomic wireless mouse.',
      description: 'Advanced Darkfield tracking, 70-day battery, silent clicks, and multi-device switching.',
      brand: 'Logitech', category: catDocs['Computers']._id,
      images: [img('mouse1'), img('mouse2')],
      price: 5499, comparePrice: 6999, stock: 50, isFeatured: true,
      tags: ['mouse', 'wireless'],
    },
    {
      name: 'Zone Headphone Studio Edition',
      shortDescription: 'Professional monitoring headphones.',
      description: 'Studio-grade open-back headphones with 50mm neodymium drivers and replaceable ear pads.',
      brand: 'Zone', category: catDocs['Accessories']._id,
      images: [img('zoneheadphone1'), img('zoneheadphone2')],
      price: 2999, comparePrice: 3999, stock: 35, isBestSeller: true,
      tags: ['headphone', 'studio'],
    },
    {
      name: 'DualSense Wireless Gaming Controller',
      shortDescription: 'Next-gen wireless controller.',
      description: 'Haptic feedback, adaptive triggers, built-in mic, and a rechargeable battery.',
      brand: 'Sony', category: catDocs['PC Gaming']._id,
      images: [img('controller1'), img('controller2')],
      price: 5999, comparePrice: 7499, stock: 28, isNewArrival: true, isBestSeller: true,
      tags: ['controller', 'gaming'],
    },
    {
      name: 'Yantch Leather & Canvas Bag',
      shortDescription: 'Premium laptop sleeve bag.',
      description: 'Handcrafted leather and canvas laptop bag fits up to 15.6" laptops with magnetic closure.',
      brand: 'Yantch', category: catDocs['Laptops']._id,
      images: [img('bag1'), img('bag2')],
      price: 2499, comparePrice: 3499, stock: 60,
      tags: ['bag', 'accessory'],
    },
  ];

  for (const p of sampleProducts) {
    const exists = await Product.findOne({ name: p.name });
    if (!exists) await Product.create(p);
  }
  console.log(`✅ Products seeded (${sampleProducts.length})`);

  // Settings
  let settings = await Setting.findOne({ key: 'main' });
  if (!settings) {
    settings = await Setting.create({
      key: 'main',
      hero: {
        tag: 'Hot Deal in This Week',
        title: 'Roco Wireless Headphone',
        subtitle: 'Premium sound, uncompromised comfort.',
        price: 49,
        image: 'https://picsum.photos/seed/hero/800/800',
        ctaText: 'Shop Now',
        ctaLink: '/shop',
        rating: 4, reviewsCount: 100,
      },
      dealBanner: {
        enabled: true,
        tag: 'Quick Sale!',
        title: 'Enhance Your Music Experience',
        image: 'https://picsum.photos/seed/deal/800/600',
        endsAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      },
      footer: {
        about: 'ezoneshoppi is your destination for premium electronics — headphones, laptops, wearables and more.',
        columns: [
          {
            title: 'Shop',
            links: [
              { label: 'All Products', url: '/shop' },
              { label: 'Phones', url: '/shop?category=phones' },
              { label: 'Laptops', url: '/shop?category=laptops' },
              { label: 'Accessories', url: '/shop?category=accessories' },
            ],
          },
          {
            title: 'Company',
            links: [
              { label: 'About Us', url: '/about' },
              { label: 'Blog', url: '/blog' },
              { label: 'Contact', url: '/contact' },
            ],
          },
          {
            title: 'Help',
            links: [
              { label: 'FAQ', url: '/faq' },
              { label: 'Shipping', url: '/shipping' },
              { label: 'Returns', url: '/returns' },
            ],
          },
        ],
      },
    });
    console.log('✅ Settings seeded');
  }

  // Blog
  const blogCount = await Blog.countDocuments();
  if (blogCount === 0) {
    await Blog.insertMany([
      {
        title: 'Top 5 Wireless Headphones of 2026',
        excerpt: 'Discover the best wireless headphones that deliver studio-quality sound.',
        content: 'Wireless headphones have evolved dramatically...',
        coverImage: img('blog1'),
        authorName: 'Admin',
        tags: ['audio', 'review'],
        isPublished: true,
      },
      {
        title: 'How to Pick the Perfect Gaming Setup',
        excerpt: 'A complete guide to building your dream gaming station.',
        content: 'Building the perfect gaming setup starts with...',
        coverImage: img('blog2'),
        authorName: 'Admin',
        tags: ['gaming', 'guide'],
        isPublished: true,
      },
    ]);
    console.log('✅ Blog posts seeded');
  }

  console.log('\n🎉 Seeding complete!\n');
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
