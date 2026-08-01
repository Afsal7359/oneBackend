import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { protect, optionalAuth, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadMiddleware } from '../services/upload.js';
import { cache } from '../utils/responseCache.js';

import * as auth from '../controllers/auth.controller.js';
import * as user from '../controllers/user.controller.js';
import * as product from '../controllers/product.controller.js';
import * as category from '../controllers/category.controller.js';
import * as review from '../controllers/review.controller.js';
import * as cart from '../controllers/cart.controller.js';
import * as coupon from '../controllers/coupon.controller.js';
import * as order from '../controllers/order.controller.js';
import * as payment from '../controllers/payment.controller.js';
import * as content from '../controllers/content.controller.js';
import * as admin from '../controllers/admin.controller.js';
import * as catalog from '../controllers/adminCatalog.controller.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts — please try again in 15 minutes' },
});

const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

/* ---------------------------------------------------------------------- auth */
const authRoutes = Router();
authRoutes.post('/register', authLimiter, validate(auth.registerSchema), auth.register);
authRoutes.post('/login', authLimiter, validate(auth.loginSchema), auth.login);
authRoutes.post('/logout', auth.logout);
authRoutes.post('/refresh', auth.refresh);
authRoutes.get('/me', protect, auth.me);
authRoutes.patch('/password', protect, auth.changePassword);
authRoutes.post('/forgot-password', authLimiter, auth.forgotPassword);
authRoutes.post('/reset-password', authLimiter, auth.resetPassword);
authRoutes.post('/merge-cart', protect, auth.mergeCart);
router.use('/auth', authRoutes);

/* ----------------------------------------------------------------- customers */
const accountRoutes = Router();
accountRoutes.use(protect);
accountRoutes.patch('/profile', user.updateProfile);
accountRoutes.get('/addresses', user.listAddresses);
accountRoutes.post('/addresses', user.addAddress);
accountRoutes.patch('/addresses/:id', user.updateAddress);
accountRoutes.delete('/addresses/:id', user.deleteAddress);
accountRoutes.get('/wishlist', user.getWishlist);
accountRoutes.post('/wishlist/toggle', user.toggleWishlist);
router.use('/account', accountRoutes);

/* ------------------------------------------------------------------ catalog */
// Storefront reads dominate traffic; a write to any tagged model clears the
// matching entries immediately, so nothing here can go stale.
router.get('/products', cache(['Product', 'Category'], 60_000), validate(product.listQuerySchema, 'query'), product.listProducts);
router.get('/products/suggest', cache(['Product'], 120_000), product.searchSuggest);
router.get('/products/storefront', cache(['Product', 'Category', 'Banner', 'Setting'], 60_000), product.getStorefront);
router.get('/products/:slug', cache(['Product', 'Category'], 60_000), product.getProduct);
router.get('/products/:slug/reviews', cache(['Review'], 120_000), review.listReviews);

router.get('/categories', cache(['Category', 'Product'], 60_000), category.listCategories);
router.get('/categories/:slug', cache(['Category'], 60_000), category.getCategory);

router.post('/reviews', protect, writeLimiter, review.createReview);
router.patch('/reviews/:id', protect, review.updateReview);
router.delete('/reviews/:id', protect, review.deleteReview);

/* --------------------------------------------------------------------- cart */
router.post('/cart/preview', optionalAuth, validate(cart.previewSchema), cart.previewCart);
router.get('/cart', protect, cart.getCart);
router.put('/cart', protect, cart.saveCart);
router.delete('/cart', protect, cart.clearCart);

/* ------------------------------------------------------------------ coupons */
router.get('/coupons', coupon.listPublicCoupons);
router.post('/coupons/validate', optionalAuth, writeLimiter, coupon.validateCoupon);

/* ------------------------------------------------------------------- orders */
router.post('/orders', protect, writeLimiter, validate(order.createOrderSchema), order.createOrder);
router.get('/orders', protect, order.listMyOrders);
router.get('/orders/:id', protect, order.getMyOrder);
router.post('/orders/:id/cancel', protect, order.cancelMyOrder);

/* ----------------------------------------------------------------- payments */
router.get('/payments/config', payment.getPaymentConfig);
router.post('/payments/verify', protect, payment.verifyPayment);
router.post('/payments/simulate', protect, payment.simulatePayment);
router.post('/payments/failed', protect, payment.markPaymentFailed);
// NOTE: the webhook is mounted in server.js with a raw body parser.

/* ------------------------------------------------------------------ content */
router.get('/site-config', cache(['Setting', 'Banner'], 300_000), content.getSiteConfig);
router.get('/pages', cache(['Page'], 300_000), content.listPages);
router.get('/pages/:slug', cache(['Page'], 300_000), content.getPage);
router.post('/contact', writeLimiter, content.submitContact);
router.post('/subscribe', writeLimiter, content.subscribe);

/* -------------------------------------------------------------------- admin */
const adminRoutes = Router();
adminRoutes.use(adminOnly);

adminRoutes.get('/dashboard', admin.getDashboard);

adminRoutes.post('/upload', uploadMiddleware.array('images', 10), catalog.uploadImages);
adminRoutes.post('/upload/delete', catalog.deleteImage);

adminRoutes.get('/products', catalog.listProductsAdmin);
adminRoutes.post('/products', catalog.createProduct);
adminRoutes.get('/products/:id', catalog.getProductAdmin);
adminRoutes.patch('/products/:id', catalog.updateProduct);
adminRoutes.delete('/products/:id', catalog.deleteProduct);

adminRoutes.get('/categories', catalog.listCategoriesAdmin);
adminRoutes.post('/categories', catalog.createCategory);
adminRoutes.patch('/categories/:id', catalog.updateCategory);
adminRoutes.delete('/categories/:id', catalog.deleteCategory);

adminRoutes.get('/coupons', catalog.listCoupons);
adminRoutes.post('/coupons', catalog.createCoupon);
adminRoutes.patch('/coupons/:id', catalog.updateCoupon);
adminRoutes.delete('/coupons/:id', catalog.deleteCoupon);
adminRoutes.get('/coupons/:id/usage', admin.couponUsage);

adminRoutes.get('/orders', admin.listOrders);
adminRoutes.get('/orders/:id', admin.getOrder);
adminRoutes.patch('/orders/:id/status', admin.updateOrderStatus);
adminRoutes.patch('/orders/:id/tracking', admin.updateOrderTracking);
adminRoutes.post('/orders/:id/refund', admin.refundOrder);

adminRoutes.get('/users', admin.listUsers);
adminRoutes.get('/users/:id', admin.getUser);
adminRoutes.patch('/users/:id', admin.updateUser);

adminRoutes.get('/reviews', admin.listReviewsAdmin);
adminRoutes.patch('/reviews/:id', admin.updateReviewAdmin);
adminRoutes.delete('/reviews/:id', admin.deleteReviewAdmin);

adminRoutes.get('/banners', catalog.listBanners);
adminRoutes.post('/banners', catalog.createBanner);
adminRoutes.patch('/banners/:id', catalog.updateBanner);
adminRoutes.delete('/banners/:id', catalog.deleteBanner);

adminRoutes.get('/pages', catalog.listPagesAdmin);
adminRoutes.post('/pages', catalog.createPage);
adminRoutes.get('/pages/:id', catalog.getPageAdmin);
adminRoutes.patch('/pages/:id', catalog.updatePage);
adminRoutes.delete('/pages/:id', catalog.deletePage);

adminRoutes.get('/settings', catalog.getSettings);
adminRoutes.patch('/settings', catalog.updateSettings);

adminRoutes.get('/contacts', admin.listContacts);
adminRoutes.patch('/contacts/:id', admin.updateContact);
adminRoutes.get('/subscribers', admin.listSubscribers);

router.use('/admin', adminRoutes);

export default router;
