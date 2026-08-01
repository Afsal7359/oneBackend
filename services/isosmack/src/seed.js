/* eslint-disable no-console */
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import User from './models/User.js';
import Category from './models/Category.js';
import Product from './models/Product.js';
import Review from './models/Review.js';
import Coupon from './models/Coupon.js';
import Order from './models/Order.js';
import Cart from './models/Cart.js';
import { Banner, Page, Setting, Contact, Subscriber } from './models/Content.js';

const IMG = (name) => ({ url: `/uploads/seed/${name}`, publicId: `local:seed/${name}`, alt: '' });

/* ------------------------------------------------------------------ products */

const PRODUCTS = [
  {
    name: 'Protein Oats — Chocolate Hazelnut',
    cardTitle: '20g Protein Oats – Chocolate Hazelnut',
    tagline: 'Smooth. Creamy. Nutritious.',
    flavour: 'Chocolate Hazelnut',
    images: [IMG('oats.jpg')],
    price: 749,
    mrp: 899,
    stock: 120,
    packLabel: 'Net Wt',
    packValue: '500g',
    badge: 'Bestseller',
    badgeDark: false,
    offerText: 'Free Shipping + 3% Prepaid Bonus',
    weightGrams: 500,
    isFeatured: true,
    sortOrder: 1,
    ratingAvg: 4.9,
    ratingCount: 126,
    soldCount: 340,
    description:
      'A proper breakfast that happens to carry 20g of protein. Whole rolled oats and jowar do the heavy lifting, cocoa and hazelnut do the rest. Stir it into hot milk for three minutes and you have a bowl that holds you through the morning instead of dropping you at 11am.',
    highlights: [
      '20g protein per 60g serving',
      'Whole rolled oats + jowar for real fibre',
      'No added cane sugar',
      'No palm oil, no artificial preservatives',
      'Ready in 3 minutes with hot milk or water',
    ],
    specs: ['500g pack', '~8 servings', 'Vegetarian', 'Contains milk & hazelnut'],
    nutrition: [
      { key: 'Serving size', value: '60g' },
      { key: 'Energy', value: '232 kcal' },
      { key: 'Protein', value: '20 g' },
      { key: 'Carbohydrate', value: '27 g' },
      { key: '— of which sugars', value: '1.8 g' },
      { key: 'Dietary fibre', value: '7.2 g' },
      { key: 'Total fat', value: '5.4 g' },
    ],
    ingredients:
      'Rolled oats, whey protein concentrate, jowar flakes, cocoa powder, hazelnut paste, milk solids, natural flavour, sea salt, nature-identical sweetener (sucralose).',
    allergens: 'Contains milk, hazelnut and gluten (oats processed on shared lines).',
    howToUse:
      'Add 60g (about 2 heaped scoops) to 180ml of hot milk or water. Stir well, leave for 3 minutes, stir again. Top with fruit or a spoon of ISOSMACK Peanut Butter.',
    faqs: [
      { q: 'Can I make it cold?', a: 'Yes — soak overnight in cold milk in the fridge for an overnight-oats texture.' },
      { q: 'How many servings per pack?', a: 'About 8 servings of 60g each from the 500g pack.' },
    ],
    seoTitle: 'Protein Oats – Chocolate Hazelnut | 20g protein | ISOSMACK',
    seoDescription:
      '20g protein per serving, whole rolled oats and jowar, no added sugar. Chocolate hazelnut protein oats from ISOSMACK. 500g pack.',
  },
  {
    name: 'Protein Bar — Chocolate Brownie',
    cardTitle: '20g Protein Bar – Chocolate Brownie',
    tagline: 'Built. Tough. Satisfying.',
    flavour: 'Chocolate Brownie',
    images: [IMG('bar.jpg')],
    price: 399,
    mrp: 499,
    stock: 200,
    packLabel: 'Pack of',
    packValue: '6',
    badge: 'Just launched',
    badgeDark: true,
    offerText: '',
    weightGrams: 360,
    isFeatured: true,
    sortOrder: 2,
    ratingAvg: 4.8,
    ratingCount: 94,
    soldCount: 260,
    description:
      'A fudge brownie that happens to be a protein bar, not a protein bar pretending to be a brownie. 20g of protein in a 60g bar, dense rather than chalky, and it survives a gym bag in June.',
    highlights: [
      '20g protein per 60g bar',
      'Pack of 6 bars',
      'No added sugar',
      'High fibre',
      'Fits a gym bag, a desk drawer or a glovebox',
    ],
    specs: ['6 × 60g bars', '360g total', 'Vegetarian', 'Contains milk & peanuts'],
    nutrition: [
      { key: 'Serving size', value: '60g (1 bar)' },
      { key: 'Energy', value: '218 kcal' },
      { key: 'Protein', value: '20 g' },
      { key: 'Carbohydrate', value: '22 g' },
      { key: '— of which sugars', value: '1.4 g' },
      { key: 'Dietary fibre', value: '6.8 g' },
      { key: 'Total fat', value: '6.1 g' },
    ],
    ingredients:
      'Whey protein blend, soluble corn fibre, cocoa mass, almonds, peanuts, cocoa butter, milk solids, natural flavour, sea salt, nature-identical sweetener (sucralose).',
    allergens: 'Contains milk, peanuts and tree nuts.',
    howToUse: 'Eat one between lunch and the gym, or whenever the gap between meals gets too long.',
    faqs: [
      { q: 'Does it melt?', a: 'It softens in real heat but holds its shape. Ten minutes in the fridge brings it straight back.' },
      { q: 'Is it a meal replacement?', a: 'No — it is a snack that carries a meal-sized amount of protein.' },
    ],
    seoTitle: 'Protein Bar – Chocolate Brownie | 20g protein | Pack of 6 | ISOSMACK',
    seoDescription:
      'A dense chocolate brownie protein bar with 20g protein and no added sugar. Pack of 6 from ISOSMACK.',
  },
  {
    name: 'Protein Granola — Chocolate Dark',
    cardTitle: '22g Protein Granola – Chocolate Dark',
    tagline: 'Crunchy. Nutritious. Delicious.',
    flavour: 'Chocolate Dark',
    images: [IMG('granola.jpg')],
    price: 649,
    mrp: 799,
    stock: 140,
    packLabel: 'Net Wt',
    packValue: '400g',
    badge: '',
    badgeDark: false,
    offerText: 'Free Shipping + 3% Prepaid Bonus',
    weightGrams: 400,
    isFeatured: true,
    sortOrder: 3,
    ratingAvg: 4.9,
    ratingCount: 211,
    soldCount: 410,
    description:
      'Baked in clusters big enough to pick up with your fingers, with 22g of protein per serving and dark chocolate that reads bitter rather than sweet. Good over curd, better straight from the jar at 4pm.',
    highlights: [
      '22g protein per 60g serving',
      'Baked in large clusters',
      'High fibre',
      'No added sugar, no preservatives',
      'Works with curd, milk or on its own',
    ],
    specs: ['400g pack', '~6 servings', 'Vegetarian', 'Contains milk & gluten'],
    nutrition: [
      { key: 'Serving size', value: '60g' },
      { key: 'Energy', value: '246 kcal' },
      { key: 'Protein', value: '22 g' },
      { key: 'Carbohydrate', value: '25 g' },
      { key: '— of which sugars', value: '2.1 g' },
      { key: 'Dietary fibre', value: '8.1 g' },
      { key: 'Total fat', value: '6.9 g' },
    ],
    ingredients:
      'Rolled oats, whey protein concentrate, dark chocolate chunks (cocoa mass, cocoa butter), almonds, jowar, sunflower oil, natural flavour, sea salt, nature-identical sweetener (sucralose).',
    allergens: 'Contains milk, tree nuts and gluten.',
    howToUse: 'Serve 60g over cold milk or curd, or eat dry as a snack.',
    faqs: [
      { q: 'How big are the clusters?', a: 'Roughly bite-sized — big enough to pick up rather than spoon.' },
      { q: 'Is it very sweet?', a: 'No. It is built around dark chocolate, so it reads bitter-rich rather than sugary.' },
    ],
    seoTitle: 'Protein Granola – Chocolate Dark | 22g protein | ISOSMACK',
    seoDescription:
      '22g protein per serving, baked in large clusters with dark chocolate. No added sugar. 400g pack from ISOSMACK.',
  },
  {
    name: 'Peanut Butter — Creamy High Protein',
    cardTitle: '26g Peanut Butter – Creamy High Protein',
    tagline: 'Creamy | High Protein.',
    flavour: 'Creamy · High Protein',
    images: [IMG('pb.jpg')],
    price: 449,
    mrp: 549,
    stock: 180,
    packLabel: 'Net Wt',
    packValue: '350g',
    badge: '',
    badgeDark: false,
    offerText: '',
    weightGrams: 350,
    isFeatured: true,
    sortOrder: 4,
    ratingAvg: 5,
    ratingCount: 178,
    soldCount: 380,
    description:
      'Peanuts, cocoa and salt. That is the whole list. 26g of protein per 100g, ground long enough to go properly creamy, and no palm oil to sit heavy on the roof of your mouth.',
    highlights: [
      '26g protein per 100g',
      'Three ingredients, nothing else',
      'No palm oil, no added sugar',
      'Vegan',
      'Stirs into oats, spreads on toast, works off a spoon',
    ],
    specs: ['350g jar', 'Vegan', 'Contains peanuts', 'No palm oil'],
    nutrition: [
      { key: 'Serving size', value: '100g' },
      { key: 'Energy', value: '588 kcal' },
      { key: 'Protein', value: '26 g' },
      { key: 'Carbohydrate', value: '16 g' },
      { key: '— of which sugars', value: '3.2 g' },
      { key: 'Dietary fibre', value: '8.4 g' },
      { key: 'Total fat', value: '46 g' },
    ],
    ingredients: 'Roasted peanuts (98%), cocoa powder, sea salt.',
    allergens: 'Contains peanuts. Made in a facility that also handles tree nuts and milk.',
    howToUse: 'Spread it, stir it into oats, or eat it off a spoon. Natural oil separation is normal — stir once on opening.',
    faqs: [
      { q: 'Why is there oil on top?', a: 'No palm oil means nothing is holding the peanut oil in suspension. Stir once when you open it and refrigerate after.' },
      { q: 'Is it vegan?', a: 'Yes — peanuts, cocoa and salt, nothing else.' },
    ],
    seoTitle: 'Peanut Butter – Creamy High Protein | 26g protein | ISOSMACK',
    seoDescription:
      'Three-ingredient creamy peanut butter with 26g protein per 100g. No palm oil, no added sugar. 350g jar from ISOSMACK.',
  },
];

/* --------------------------------------------------------------------- pages */

const wrap = (body) => body.trim();

const PAGES = [
  {
    title: 'Privacy Policy',
    slug: 'privacy-policy',
    footerGroup: 'Support',
    sortOrder: 1,
    excerpt: 'What we collect, why we collect it, and what we never do with it.',
    content: wrap(`
<p><em>Last updated: 30 July 2026</em></p>
<p>This policy explains what personal information ISOSMACK collects when you use this website, why we collect it, and the choices you have. We have tried to write it in plain language rather than legalese.</p>

<h2>Who we are</h2>
<p>ISOSMACK ("we", "us") operates this online store. For any privacy question, write to <a href="mailto:hello@isosmack.com">hello@isosmack.com</a>.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Account details</strong> — your name, email address and phone number when you create an account.</li>
  <li><strong>Order details</strong> — delivery address, the items you bought and your order history.</li>
  <li><strong>Payment information</strong> — handled entirely by Razorpay. Card numbers, UPI IDs and net-banking credentials are entered on Razorpay's systems and are never stored on ours. We only receive a payment reference and a success or failure status.</li>
  <li><strong>Technical data</strong> — IP address, browser type and pages visited, used to keep the site secure and working.</li>
  <li><strong>Communications</strong> — messages you send us through the contact form.</li>
</ul>

<h2>Why we collect it</h2>
<ul>
  <li>To process, pack, ship and support your orders.</li>
  <li>To provide customer service and answer your questions.</li>
  <li>To detect and prevent fraud and abuse.</li>
  <li>To meet tax and accounting obligations under Indian law.</li>
  <li>To send marketing email — only if you have opted in, and every message carries an unsubscribe link.</li>
</ul>

<h2>Who we share it with</h2>
<p>We do not sell your personal information. We share it only with the service providers needed to run the store:</p>
<ul>
  <li><strong>Razorpay</strong> — payment processing.</li>
  <li><strong>Courier partners</strong> — name, address and phone number, so your parcel can be delivered.</li>
  <li><strong>Cloud hosting and email providers</strong> — to run the site and send order updates.</li>
  <li><strong>Government authorities</strong> — where we are legally required to disclose information.</li>
</ul>

<h2>How long we keep it</h2>
<p>Order records are kept for eight years to satisfy Indian tax law. Account data is kept until you ask us to delete it. Marketing consent is kept until you withdraw it.</p>

<h2>Your rights</h2>
<p>You can ask us to show you the data we hold about you, correct anything wrong, delete your account, or stop sending you marketing. Email <a href="mailto:hello@isosmack.com">hello@isosmack.com</a> and we will respond within 30 days. Deleting your account does not remove invoices we are legally required to retain.</p>

<h2>Cookies</h2>
<p>We use cookies to keep you signed in, remember your cart, and understand which pages are used. You can block cookies in your browser, but the cart and sign-in will stop working.</p>

<h2>Security</h2>
<p>Passwords are stored hashed with bcrypt, never in plain text. Traffic is encrypted over HTTPS. Payment credentials never touch our servers. No system is perfectly secure, but we take this seriously.</p>

<h2>Children</h2>
<p>This store is not intended for anyone under 18. We do not knowingly collect data from children.</p>

<h2>Changes</h2>
<p>If this policy changes materially we will update the date at the top and, where the change is significant, notify account holders by email.</p>
`),
  },
  {
    title: 'Terms & Conditions',
    slug: 'terms-and-conditions',
    footerGroup: 'Support',
    sortOrder: 2,
    excerpt: 'The agreement between you and ISOSMACK when you shop with us.',
    content: wrap(`
<p><em>Last updated: 30 July 2026</em></p>
<p>By using this website or placing an order you agree to these terms. Please read them before you buy.</p>

<h2>1. Using this site</h2>
<p>You must be at least 18 and able to enter a contract. You agree to give accurate information when you register and order, and to keep your password to yourself. You are responsible for activity under your account.</p>

<h2>2. Products and descriptions</h2>
<p>We describe our products as accurately as we can. Nutrition values are measured on the finished product and may vary within normal manufacturing tolerance. Pack photography is representative; packaging design may be updated from time to time.</p>
<p>Our products are food, not medicine. Nothing on this site is medical advice and nothing here is intended to diagnose, treat, cure or prevent any disease. If you are pregnant, nursing, managing a medical condition or taking medication, talk to a doctor before making a significant change to your diet.</p>

<h2>3. Pricing</h2>
<p>All prices are in Indian Rupees and are inclusive of GST unless stated otherwise. Shipping is calculated at checkout. We may change prices at any time, but a change never affects an order already confirmed.</p>
<p>If a product is listed at an obviously incorrect price because of a technical error, we may cancel the order and refund you in full rather than fulfil it.</p>

<h2>4. Orders</h2>
<p>Your order is an offer to buy. We accept it when we send order confirmation. We may decline an order if the item is out of stock, we cannot deliver to your address, payment fails, or we suspect fraud.</p>

<h2>5. Payment</h2>
<p>Payments are processed by Razorpay. We accept UPI, credit and debit cards, net banking and wallets. Cash on delivery is available on eligible orders and may carry a handling fee shown at checkout. We do not store your card details.</p>

<h2>6. Coupons</h2>
<p>Coupon codes carry their own conditions — minimum order value, expiry date, usage limits and product eligibility — shown when you apply them. One code applies per order unless stated otherwise. We may withdraw a code at any time, and we may cancel orders where a code has been used abusively or in bad faith.</p>

<h2>7. Delivery, cancellation and refunds</h2>
<p>See our <a href="/pages/shipping-policy">Shipping Policy</a> and <a href="/pages/refund-policy">Cancellation &amp; Refund Policy</a>, both of which form part of these terms.</p>

<h2>8. Intellectual property</h2>
<p>The ISOSMACK name, logo, packaging design, photography and site content belong to us. You may not reproduce them commercially without written permission.</p>

<h2>9. Liability</h2>
<p>To the extent permitted by law, our total liability for any order is limited to the amount you paid for it. We are not liable for indirect or consequential loss. Nothing here limits liability that cannot lawfully be limited, including for death or personal injury caused by our negligence.</p>

<h2>10. Governing law</h2>
<p>These terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of the courts of Kerala, India.</p>

<h2>11. Contact</h2>
<p>Questions about these terms: <a href="mailto:hello@isosmack.com">hello@isosmack.com</a>.</p>
`),
  },
  {
    title: 'Cancellation & Refund Policy',
    slug: 'refund-policy',
    footerGroup: 'Support',
    sortOrder: 3,
    excerpt: 'How to cancel, when we refund, and how long it takes.',
    content: wrap(`
<p><em>Last updated: 30 July 2026</em></p>

<h2>Cancelling an order</h2>
<p>You can cancel free of charge any time before your order is marked <strong>Shipped</strong>. Go to <a href="/account/orders">My Orders</a> and press Cancel, or email <a href="mailto:orders@isosmack.com">orders@isosmack.com</a> with your order number.</p>
<p>Once an order has shipped it cannot be cancelled, but you can refuse delivery or raise a return under the conditions below.</p>

<h2>Returns</h2>
<p>Because we sell food, we cannot accept returns of opened packs for reasons of hygiene and safety. We will replace or refund an order in any of these cases:</p>
<ul>
  <li>The product arrived damaged, leaking or crushed.</li>
  <li>You received the wrong item or the wrong quantity.</li>
  <li>The product is past, or too close to, its best-before date on arrival.</li>
  <li>The pack seal was broken on arrival.</li>
</ul>
<p>Tell us within <strong>7 days of delivery</strong> at <a href="mailto:orders@isosmack.com">orders@isosmack.com</a> with your order number and photographs of the item and the outer packaging. Photographs let us settle most claims the same day.</p>

<h2>Refund timelines</h2>
<ul>
  <li><strong>Approval</strong> — we assess and respond to claims within 2 business days.</li>
  <li><strong>Prepaid orders</strong> — refunds are issued to the original payment method and reach you in 5–7 business days once approved, depending on your bank.</li>
  <li><strong>Cash on delivery</strong> — refunds are made by bank transfer. We will ask for your account details and process it within 7 business days.</li>
  <li><strong>Cancelled before shipping</strong> — refunded in full, including shipping, within 5–7 business days.</li>
</ul>

<h2>Partial refunds</h2>
<p>If only part of your order is affected, we refund the value of the affected items plus a proportionate share of shipping.</p>

<h2>Failed payments</h2>
<p>If money left your account but the order did not confirm, it is an authorisation that was never captured. Banks release it automatically, usually within 5–7 business days. If it has not returned after 7 business days, email us with your order number and we will chase it with Razorpay.</p>

<h2>Not covered</h2>
<ul>
  <li>Change of mind on an opened pack.</li>
  <li>Dislike of flavour or texture where the product is as described.</li>
  <li>Claims raised more than 7 days after delivery.</li>
  <li>Damage caused after delivery by storage in heat or damp.</li>
</ul>

<h2>Contact</h2>
<p><a href="mailto:orders@isosmack.com">orders@isosmack.com</a> — Monday to Saturday, 10AM–6PM IST.</p>
`),
  },
  {
    title: 'Shipping Policy',
    slug: 'shipping-policy',
    footerGroup: 'Support',
    sortOrder: 4,
    excerpt: 'Where we ship, what it costs, and how long it takes.',
    content: wrap(`
<p><em>Last updated: 30 July 2026</em></p>

<h2>Where we ship</h2>
<p>We ship across India. We do not ship internationally at present.</p>

<h2>Cost</h2>
<ul>
  <li><strong>Free shipping</strong> on all orders over ₹999.</li>
  <li>Below ₹999, a flat ₹69 applies.</li>
  <li>Cash on delivery carries a ₹49 handling fee, shown at checkout before you pay.</li>
  <li>Prepaid orders get 3% off the order value, applied automatically at checkout.</li>
</ul>

<h2>Dispatch</h2>
<p>Orders placed before 2PM on a business day are dispatched the same day. Orders after that, or on Sundays and public holidays, go out the next business day.</p>

<h2>Delivery time</h2>
<ul>
  <li><strong>Metro cities</strong> — 2 to 3 business days from dispatch.</li>
  <li><strong>Rest of India</strong> — 4 to 6 business days from dispatch.</li>
  <li>Remote PIN codes can take 2 to 3 days longer.</li>
</ul>
<p>These are courier estimates, not guarantees. Weather, strikes and festival volumes can push them out.</p>

<h2>Tracking</h2>
<p>You get a tracking link by email and SMS the moment your parcel leaves our warehouse. You can also follow it under <a href="/account/orders">My Orders</a>.</p>

<h2>Delivery attempts</h2>
<p>Couriers attempt delivery up to three times. After three failed attempts the parcel returns to us. We will contact you to arrange re-dispatch; a second shipping fee applies for re-dispatch on a returned prepaid order.</p>

<h2>Incorrect addresses</h2>
<p>Please check your address and phone number before you pay. If an order is undeliverable because the address was wrong, we can re-dispatch it once the parcel is back with us, with shipping payable again.</p>

<h2>Damaged parcels</h2>
<p>If the outer packaging is visibly damaged, photograph it before opening and email <a href="mailto:orders@isosmack.com">orders@isosmack.com</a> within 7 days. See our <a href="/pages/refund-policy">Cancellation &amp; Refund Policy</a>.</p>
`),
  },
  {
    title: 'Contact Us',
    slug: 'contact-us',
    footerGroup: 'Support',
    sortOrder: 5,
    excerpt: 'How to reach a human at ISOSMACK.',
    content: wrap(`
<h2>Talk to us</h2>
<p>There is a person at the other end of these addresses, and we answer within one working day.</p>
<ul>
  <li><strong>Orders, delivery and refunds</strong> — <a href="mailto:orders@isosmack.com">orders@isosmack.com</a></li>
  <li><strong>Everything else</strong> — <a href="mailto:hello@isosmack.com">hello@isosmack.com</a></li>
</ul>
<p><strong>Hours:</strong> Monday to Saturday, 10AM–6PM IST. Closed on Sundays and public holidays.</p>

<h2>Registered office</h2>
<p>ISOSMACK<br/>
[Add your registered business address here]<br/>
Kerala, India</p>
<p>[Add GSTIN / CIN / FSSAI licence number here — Razorpay and FSSAI both require these to be displayed.]</p>

<h2>Before you write</h2>
<p>Including your order number (it looks like ISO202600001) gets you a faster answer. For damage or wrong-item claims, attach photographs of the product and the outer packaging.</p>
`),
  },
  {
    title: 'About ISOSMACK',
    slug: 'about',
    footerGroup: 'Company',
    sortOrder: 6,
    excerpt: 'Why we built a protein range you chew instead of drink.',
    content: wrap(`
<h2>Fuel Strong. Live Strong.</h2>
<p>ISOSMACK started with a straightforward frustration: hitting a protein target meant drinking most of it. Powder has its place, but nobody wants four shakes a day, and the food alternatives were either chalky, sickly sweet, or carried an ingredient list you needed a chemistry degree to read.</p>

<h2>Flavour first, then the numbers</h2>
<p>Most protein food starts with a nutrition panel and tries to make it taste good afterwards. We went the other way. We built a chocolate hazelnut, a dark chocolate cluster and a fudge brownie worth eating first, then engineered the protein in without wrecking them. The ones that failed that test never made it to a pack.</p>

<h2>Short ingredient lists</h2>
<p>No added cane sugar, no palm oil, no artificial preservatives — across all four products. Our peanut butter has three ingredients. If something is on the pack, you should be able to picture what it is.</p>

<h2>One range, four moments</h2>
<p>Breakfast, mid-morning, pre-gym, late night. The four products were designed as a set, so you are never stuck eating the same thing twice in a day just to hit your number.</p>

<h2>What's next</h2>
<p>More flavours in the formats that already work, before new formats. We would rather do four things properly than twelve things adequately.</p>
`),
  },
];

/* ------------------------------------------------------------------ settings */

const FAQS = [
  ['Is there any added sugar in the ISOSMACK range?', 'No. Nothing in the range carries added cane sugar. Sweetness comes from the cocoa, dates and a small amount of nature-identical sweetener, which is why the flavour reads rich rather than sharp. The full breakdown is printed on every pack.'],
  ['How much protein am I actually getting per serving?', 'Protein Oats give you 20g per 60g serving, Protein Granola 22g per 60g serving, the Protein Bar 20g per 60g bar, and Peanut Butter 26g per 100g. Every number on the front of the pack is measured on the finished product, not the raw blend.'],
  ['Is the range vegetarian? Is it vegan?', "All four products are vegetarian. The Oats, Granola and Bar contain milk solids, so they aren't vegan. The Peanut Butter is — it's peanuts, cocoa and salt, nothing else."],
  ['When should I eat each one?', 'Oats for breakfast, granola over curd or straight from the bowl mid-morning, the bar for the gap between lunch and the gym, and the peanut butter wherever it fits — toast, oats, or a spoon at 11pm. Most people run two of the four.'],
  ['Are there allergens I should know about?', 'The range contains milk, peanuts, hazelnuts and gluten (from oats processed on shared lines). If you have a nut or gluten allergy, check the label on the specific pack before you order.'],
  ['How long does delivery take?', "Metro cities: two to three days. Everywhere else in India: four to six. You'll get a tracking link by SMS and email the moment your order leaves the warehouse."],
];

const KNOW_MORE = [
  ['Protein you can chew, not shake', "Powder has its place, but nobody wants four shakes a day. The ISOSMACK range puts 20–26g of protein into food you'd eat anyway — a bowl of oats, a handful of granola, a bar in your bag, a spoon of peanut butter. Same protein target, far less effort."],
  ['Chocolate developed first', 'Most protein food starts with a nutrition panel and tries to make it taste good afterwards. We went the other way: build a chocolate hazelnut, a dark chocolate cluster and a fudge brownie worth eating, then engineer the protein in without wrecking them.'],
  ['Real grain, real fibre', "Whole rolled oats and jowar carry the Oats and the Granola. That's where the fibre comes from, and it's why the energy holds through the morning instead of dropping off an hour after breakfast."],
  ['Clean labels, short lists', 'No added sugar, no palm oil, no artificial preservatives across all four products. If an ingredient is on the pack, you can picture what it is.'],
  ['One range, four moments', "Breakfast, mid-morning, pre-gym, late night. The four products were designed as a set so you're never stuck eating the same thing twice in a day just to hit your number."],
];

const ADVANTAGES = [
  { icon: 'protein', title: 'High Protein', text: '20–26g in every single product' },
  { icon: 'leaf', title: 'Natural Ingredients', text: 'Short lists you can actually read' },
  { icon: 'nosugar', title: 'No Added Sugar', text: 'Sweetness from cocoa, not cane' },
  { icon: 'fibre', title: 'High Fibre', text: 'Whole oats and jowar, not fillers' },
  { icon: 'bolt', title: 'Fuel Your Best', text: 'Energy that holds through the morning' },
];

/* -------------------------------------------------------------------- runner */

const wipe = process.argv.includes('--fresh');

async function seed() {
  await connectDB();
  console.log(`\n[seed] mode: ${wipe ? 'FRESH (wipes existing data)' : 'upsert'}\n`);

  if (wipe) {
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Product.deleteMany({}),
      Review.deleteMany({}),
      Coupon.deleteMany({}),
      Order.deleteMany({}),
      Cart.deleteMany({}),
      Banner.deleteMany({}),
      Page.deleteMany({}),
      Setting.deleteMany({}),
      Contact.deleteMany({}),
      Subscriber.deleteMany({}),
      mongoose.connection.collection('counters').deleteMany({}).catch(() => {}),
    ]);
    console.log('  ✓ cleared existing collections');
  }

  /* ---- users ---- */
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@isosmack.com';
  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: 'ISOSMACK Admin',
      email: adminEmail,
      phone: '9000000001',
      password: adminPass,
      role: 'admin',
    });
    console.log(`  ✓ admin created → ${adminEmail} / ${adminPass}`);
  } else {
    console.log(`  · admin already exists → ${adminEmail}`);
  }

  let demo = await User.findOne({ email: 'customer@isosmack.com' });
  if (!demo) {
    demo = await User.create({
      name: 'Demo Customer',
      email: 'customer@isosmack.com',
      phone: '9000000002',
      password: 'Customer@123',
      role: 'customer',
      addresses: [
        {
          label: 'Home',
          fullName: 'Demo Customer',
          phone: '9000000002',
          line1: '42 Marine Drive',
          line2: 'Near Rajaji Road',
          city: 'Kochi',
          state: 'Kerala',
          pincode: '682031',
          country: 'India',
          isDefault: true,
        },
      ],
    });
    console.log('  ✓ demo customer → customer@isosmack.com / Customer@123');
  }

  /* ---- categories ---- */
  const catDefs = [
    { name: 'Protein Oats', sortOrder: 1, description: 'Breakfast that carries 20g of protein.' },
    { name: 'Protein Bars', sortOrder: 2, description: 'Dense, chewable protein for the gap between meals.' },
    { name: 'Protein Granola', sortOrder: 3, description: 'Big baked clusters with 22g of protein.' },
    { name: 'Nut Butters', sortOrder: 4, description: 'Short ingredient lists, high protein.' },
  ];
  const categories = {};
  for (const def of catDefs) {
    // eslint-disable-next-line no-await-in-loop
    let cat = await Category.findOne({ name: def.name });
    // eslint-disable-next-line no-await-in-loop
    if (!cat) cat = await Category.create(def);
    categories[def.name] = cat;
  }
  console.log(`  ✓ ${catDefs.length} categories`);

  /* ---- products ---- */
  const catFor = ['Protein Oats', 'Protein Bars', 'Protein Granola', 'Nut Butters'];
  const productDocs = [];
  for (let i = 0; i < PRODUCTS.length; i += 1) {
    const def = { ...PRODUCTS[i], category: categories[catFor[i]]._id };
    // eslint-disable-next-line no-await-in-loop
    let doc = await Product.findOne({ name: def.name });
    if (doc) {
      Object.assign(doc, def);
      // eslint-disable-next-line no-await-in-loop
      await doc.save();
    } else {
      // eslint-disable-next-line no-await-in-loop
      doc = await Product.create(def);
    }
    productDocs.push(doc);
  }
  console.log(`  ✓ ${productDocs.length} products`);

  /* ---- reviews ---- */
  const reviewSeeds = [
    { i: 0, rating: 5, title: 'Actually tastes like breakfast', body: 'Three minutes in hot milk and it holds me to lunch. The hazelnut is not artificial-tasting, which was my worry.' },
    { i: 1, rating: 5, title: 'Survived a Chennai gym bag', body: 'Soft but not a puddle. Dense and genuinely brownie-like rather than the usual chalk.' },
    { i: 2, rating: 5, title: 'The clusters are the point', body: 'Big enough to eat with your fingers. Dark chocolate reads bitter, not sugary. Gone in four days.' },
    { i: 3, rating: 5, title: 'Three ingredients, no nonsense', body: 'Stirred once, kept it in the fridge, perfect since. No palm oil aftertaste at all.' },
  ];
  for (const r of reviewSeeds) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await Review.findOne({ product: productDocs[r.i]._id, user: demo._id });
    if (!exists) {
      // eslint-disable-next-line no-await-in-loop
      await Review.create({
        product: productDocs[r.i]._id,
        user: demo._id,
        name: demo.name,
        rating: r.rating,
        title: r.title,
        body: r.body,
        isVerifiedPurchase: true,
      });
    }
  }
  // Restore the marketing rating counts the storefront design shows.
  for (let i = 0; i < productDocs.length; i += 1) {
    await Product.findByIdAndUpdate(productDocs[i]._id, {
      ratingAvg: PRODUCTS[i].ratingAvg,
      ratingCount: PRODUCTS[i].ratingCount,
    });
  }
  console.log('  ✓ sample reviews');

  /* ---- coupons ---- */
  const coupons = [
    {
      code: 'WELCOME10',
      description: '10% off your first order',
      type: 'percent',
      value: 10,
      maxDiscount: 150,
      minOrder: 499,
      firstOrderOnly: true,
      perUserLimit: 1,
      showOnSite: true,
    },
    {
      code: 'FLAT100',
      description: '₹100 off orders over ₹999',
      type: 'flat',
      value: 100,
      minOrder: 999,
      perUserLimit: 3,
      showOnSite: true,
    },
    {
      code: 'FREESHIP',
      description: 'Free shipping, any order value',
      type: 'freeship',
      value: 0,
      minOrder: 0,
      perUserLimit: 0,
      showOnSite: true,
    },
    {
      code: 'ISO20',
      description: '20% off the full range — capped at ₹300',
      type: 'percent',
      value: 20,
      maxDiscount: 300,
      minOrder: 1499,
      perUserLimit: 2,
      showOnSite: false,
    },
  ];
  for (const c of coupons) {
    // eslint-disable-next-line no-await-in-loop
    await Coupon.findOneAndUpdate({ code: c.code }, c, { upsert: true, setDefaultsOnInsert: true });
  }
  console.log(`  ✓ ${coupons.length} coupons (WELCOME10, FLAT100, FREESHIP, ISO20)`);

  /* ---- hero banner ---- */
  const heroExists = await Banner.findOne({ position: 'hero' });
  if (!heroExists) {
    await Banner.create({
      title: 'ISOSMACK range — Fuel Strong. Live Strong.',
      image: { ...IMG('hero.jpg'), alt: 'The ISOSMACK protein range: granola, oats, peanut butter and bars' },
      ctaText: 'Shop the range',
      ctaLink: '/products',
      position: 'hero',
      isActive: true,
      sortOrder: 0,
    });
    console.log('  ✓ hero banner');
  }

  /* ---- pages ---- */
  for (const p of PAGES) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await Page.findOne({ slug: p.slug });
    if (existing) {
      Object.assign(existing, p);
      // eslint-disable-next-line no-await-in-loop
      await existing.save();
    } else {
      // eslint-disable-next-line no-await-in-loop
      await Page.create(p);
    }
  }
  console.log(`  ✓ ${PAGES.length} pages (privacy, terms, refund, shipping, contact, about)`);

  /* ---- settings ---- */
  const settings = await Setting.getGlobal();
  settings.siteName = 'ISOSMACK';
  settings.tagline = 'Fuel Strong. Live Strong.';
  settings.logoText = 'ISOSMACK';
  settings.tickerItems = [
    'Free shipping on orders over ₹999',
    '3% off on prepaid orders',
    'New: Chocolate Brownie Protein Bar',
    '20–26g protein in every product',
    'No added sugar. Ever.',
  ];
  settings.advantages = ADVANTAGES;
  settings.story = {
    eyebrow: 'Built for the everyday',
    heading: 'Fuel Strong.\nLive Strong.',
    body:
      'Four products, one job: put 20–26g of protein into food you would eat anyway. No four-shakes-a-day routine, no ingredient list that needs decoding.',
    points: [
      '20–26g protein in every product',
      'No added sugar, no palm oil',
      'Whole oats and jowar for real fibre',
      'Chocolate developed first, protein engineered in after',
    ],
    image: IMG('story.jpg'),
  };
  settings.faqs = FAQS.map(([q, a]) => ({ q, a }));
  settings.knowMore = KNOW_MORE.map(([q, a]) => ({ q, a }));
  settings.socials = { instagram: 'https://instagram.com', youtube: 'https://youtube.com', email: 'hello@isosmack.com' };
  settings.contact = {
    ordersEmail: 'orders@isosmack.com',
    supportEmail: 'hello@isosmack.com',
    phone: '',
    hours: 'Mon–Sat, 10AM–6PM IST',
    address: 'Kerala, India',
  };
  settings.shipping = {
    freeAbove: 999,
    fee: 69,
    codEnabled: true,
    codFee: 49,
    codMaxOrder: 5000,
    prepaidDiscountPct: 3,
    etaMetro: '2–3 days',
    etaRest: '4–6 days',
  };
  settings.payments = { razorpayEnabled: true, methods: ['UPI', 'Visa', 'Mastercard', 'Rupay', 'Net Banking', 'COD'] };
  await settings.save();
  console.log('  ✓ site settings');

  console.log('\n[seed] done.\n');
  console.log('  Admin panel  → http://localhost:3000/admin');
  console.log(`  Admin login  → ${adminEmail} / ${adminPass}`);
  console.log('  Customer     → customer@isosmack.com / Customer@123\n');

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('\n[seed] failed:', err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
