/**
 * Crunz — migrate locally-stored images to Cloudinary
 * ---------------------------------------------------------------
 * Images uploaded before the Cloudinary switch live on this server's
 * disk (uploads/) and are referenced by absolute URLs such as
 *   http://localhost:5006/uploads/1776511522695-274338318.webp
 *
 * This script re-uploads every such image to Cloudinary and rewrites
 * the URL in MongoDB:
 *   • SiteContent `hero_slides`  → banner slides
 *   • Product `image`            → product images
 *
 * Usage (from services/crunz):
 *   node migrate-images-to-cloudinary.js          # dry run — shows what would change
 *   node migrate-images-to-cloudinary.js --apply  # actually migrate
 *
 * The local files are left on disk; delete them once the site looks right.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { v2: cloudinary } = require('cloudinary');

const SiteContent = require('./models/SiteContent');
const Product = require('./models/Product');

const APPLY = process.argv.includes('--apply');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('✖ Cloudinary env vars missing (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET).');
  process.exit(1);
}
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isLocalUpload = url =>
  typeof url === 'string' && /\/uploads\//.test(url) && !url.includes('cloudinary.com');

// Local URL → the file on disk (…/uploads/name.jpg, ignores host)
function localFilePath(url) {
  const m = url.match(/\/uploads\/(.+?)(?:[?#].*)?$/);
  if (!m) return null;
  const rel = decodeURIComponent(m[1]);
  if (rel.includes('..')) return null;
  const abs = path.join(UPLOADS_DIR, rel);
  return fs.existsSync(abs) ? abs : null;
}

const cache = new Map();   // local url → cloudinary url (same image reused across slides)

async function toCloudinary(url, folder) {
  if (cache.has(url)) return cache.get(url);

  const file = localFilePath(url);
  if (!file) {
    console.warn(`   ⚠ file not found on disk, left unchanged: ${url}`);
    return null;
  }
  if (!APPLY) {
    console.log(`   → would upload ${path.basename(file)} to ${folder}/`);
    return null;
  }
  const result = await cloudinary.uploader.upload(file, { folder, resource_type: 'image' });
  const newUrl = result.secure_url.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
  cache.set(url, newUrl);
  console.log(`   ✓ ${path.basename(file)} → ${newUrl}`);
  return newUrl;
}

async function migrateHeroSlides() {
  console.log('\n── Hero banner slides ──────────────────────────────');
  const doc = await SiteContent.findOne({ key: 'hero_slides' });
  if (!doc || !doc.value) return console.log('   No hero_slides content — nothing to do.');

  let slides;
  try { slides = JSON.parse(doc.value); } catch { return console.log('   hero_slides is not valid JSON — skipped.'); }
  if (!Array.isArray(slides) || !slides.length) return console.log('   No slides — nothing to do.');

  let changed = 0;
  for (const slide of slides) {
    if (slide.type === 'text' || !isLocalUpload(slide.src)) continue;
    const newUrl = await toCloudinary(slide.src, 'crunz/banners');
    if (newUrl) {
      slide.src = newUrl;
      slide.publicId = newUrl.match(/\/upload\/(?:f_auto,q_auto\/)?(?:v\d+\/)?(.+)\.[^.]+$/)?.[1] || '';
      changed++;
    }
  }

  if (!changed) return console.log(`   ${APPLY ? 'Nothing migrated.' : 'Dry run complete.'}`);
  doc.value = JSON.stringify(slides);
  doc.updatedAt = new Date();
  await doc.save();
  console.log(`   ✓ ${changed} banner slide(s) now served from Cloudinary.`);
}

async function migrateProducts() {
  console.log('\n── Product images ──────────────────────────────────');
  const products = await Product.find();
  let changed = 0;
  for (const p of products) {
    if (!isLocalUpload(p.image)) continue;
    console.log(`   ${p.name}`);
    const newUrl = await toCloudinary(p.image, 'crunz/products');
    if (newUrl) { p.image = newUrl; await p.save(); changed++; }
  }
  console.log(`   ${changed ? `✓ ${changed} product image(s) migrated.` : APPLY ? 'Nothing migrated.' : 'Dry run complete.'}`);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(APPLY ? '🚚 Migrating local images to Cloudinary…' : '🔍 DRY RUN — pass --apply to migrate for real.');

  await migrateHeroSlides();
  await migrateProducts();

  await mongoose.disconnect();
  console.log('\nDone.\n');
})().catch(async err => {
  console.error('\n✖ Migration failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
