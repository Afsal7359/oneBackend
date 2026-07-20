require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Banner = require('../models/Banner');
const Coupon = require('../models/Coupon');
const Settings = require('../models/Settings');
const User = require('../models/User');

const px = (id) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

const categories = [
  { name: 'Saree', image: px(37054322), order: 1 },
  { name: 'Kurtis', image: px(28512776), order: 2 },
  { name: 'Churidar', image: px(20702676), order: 3 },
];

// mirrors the original storefront catalog
const rawProducts = [
  ['AB0501','Mayura Zari Woven Silk Saree','Saree',5499,4299,true,false,37054322,['featured','best']],
  ['AB0502','Kanak Kota Doria Cotton Saree','Saree',3750,2999,false,false,28943474,[]],
  ['AB0503','Aparna Kanjivaram Silk Saree','Saree',8999,6999,true,false,28918047,['best']],
  ['AB0504','Tara Organza Saree with Scalloped Edge','Saree',5499,4499,false,false,28135787,['featured']],
  ['AB0505','Roshni Banarasi Brocade Saree','Saree',6999,5499,true,false,17113983,['best']],
  ['AB0506','Meenakshi Handloom Cotton Saree','Saree',2299,1799,false,false,30004204,[]],
  ['AB0511','Noor Hand Chikankari Cotton Kurti','Kurtis',2199,1749,true,false,28512776,['featured','best']],
  ['AB0512','Vani A-line Chikankari Kurti','Kurtis',1899,1499,false,false,28512787,[]],
  ['AB0513','Aaloka Rose Mulmul Cotton Kurti','Kurtis',1599,1299,false,false,36311379,['best']],
  ['AB0514','Ahalya Ruby Art Silk Kurti','Kurtis',2499,1999,true,false,35521738,['featured']],
  ['AB0515','Ritu Indigo Block-print Kurti','Kurtis',1499,1199,false,true,36567501,[]],
  ['AB0516','Saanvi Mustard Angrakha Kurti','Kurtis',2399,1899,false,false,14027977,['best']],
  ['AB0521','Meher Crimson Georgette Churidar Set','Churidar',3599,2899,true,false,20702676,['featured','best']],
  ['AB0522','Devika Festive Crepe Churidar Set','Churidar',3999,3199,false,false,14027903,[]],
  ['AB0523','Kavya Teal Cotton Churidar Set','Churidar',2399,1899,false,false,20702676,['best']],
  ['AB0524','Nithya Wine Art Silk Churidar','Churidar',4299,3499,true,false,14027903,['featured']],
  ['AB0525','Pooja Emerald Party Churidar','Churidar',3299,2699,false,false,8770996,[]],
  ['AB0526','Anaya Blush Georgette Churidar','Churidar',2899,2299,false,false,36567501,['best']],
];

const reviews = [
  { name: 'Priya Sharma', role: 'Verified Buyer', stars: 5, avatar: px(30004204), text: 'The fabric quality genuinely surprised me. My kurti feels premium and the stitching is flawless. Already planning my next order.', order: 1 },
  { name: 'Ananya Reddy', role: 'Verified Buyer', stars: 5, avatar: px(17113983), text: 'Delivery was quick and the saree looked even better in person than on screen. The colours are rich and true to the photos.', order: 2 },
  { name: 'Meera Krishnan', role: 'Verified Buyer', stars: 4, avatar: px(36567501), text: 'Lovely churidar set for my sister engagement. Fit was spot on with the size chart. Would have loved a few more colour options.', order: 3 },
  { name: 'Divya Patel', role: 'Verified Buyer', stars: 5, avatar: px(35521738), text: 'Customer support helped me pick the right size over chat. Thoughtful packaging and a little handwritten note felt special.', order: 4 },
  { name: 'Sneha Iyer', role: 'Verified Buyer', stars: 5, avatar: px(28918047), text: 'Third order from Aligaah and never disappointed. The hand-worked details are worth every rupee. My go-to for festive wear.', order: 5 },
];

async function run() {
  connectDB();
  await mongoose.connection.asPromise();
  console.log('Clearing existing catalog...');
  await Promise.all([
    Category.deleteMany({}), Product.deleteMany({}), Review.deleteMany({}),
    Banner.deleteMany({}), Coupon.deleteMany({}),
  ]);

  console.log('Seeding categories...');
  const catDocs = await Category.create(categories);
  const catMap = Object.fromEntries(catDocs.map((c) => [c.name, c]));

  console.log('Seeding products...');
  const products = rawProducts.map(([code, title, catName, oldPrice, price, isHot, isSoldOut, imgId, tags]) => ({
    code, title, oldPrice, price, isHot, isSoldOut,
    category: catMap[catName]._id, categoryName: catName,
    images: [{ url: px(imgId), publicId: '' }],
    isFeatured: tags.includes('featured'),
    isBestSeller: tags.includes('best'),
    isNewArrival: true, stock: isSoldOut ? 0 : 12,
    views: Math.floor(Math.random() * 40), sales: Math.floor(Math.random() * 10),
  }));
  await Product.create(products);

  console.log('Seeding reviews...');
  await Review.create(reviews);

  console.log('Seeding hero banner...');
  await Banner.create({
    title: 'Unleash Your Fashion Potential',
    buttonText: 'SHOP NOW', link: '#shop', position: 'hero', order: 1,
    image: 'https://images.pexels.com/photos/30004204/pexels-photo-30004204.jpeg?auto=compress&cs=tinysrgb&w=1400',
  });

  console.log('Seeding sample coupons...');
  await Coupon.create([
    { code: 'WELCOME10', description: '10% off your first order', type: 'percent', value: 10, minCartValue: 1000, maxDiscount: 1000 },
    { code: 'FLAT500', description: 'Flat ₹500 off above ₹3000', type: 'fixed', value: 500, minCartValue: 3000 },
  ]);

  console.log('Ensuring settings + admin user...');
  await Settings.getSingleton();
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@aligaah.com').toLowerCase();
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: process.env.ADMIN_NAME || 'Admin',
      email: adminEmail,
      password: process.env.ADMIN_PASSWORD || 'admin12345',
      role: 'admin',
    });
    console.log(`Admin created: ${adminEmail} / ${process.env.ADMIN_PASSWORD || 'admin12345'}`);
  } else {
    console.log(`Admin already exists: ${adminEmail}`);
  }

  console.log('\nSeed complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
