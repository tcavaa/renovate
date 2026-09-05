import {
  mysqlTable,
  int,
  varchar,
  text,
  decimal,
  boolean,
  timestamp,
  mysqlEnum,
  json,
  index,
} from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  role: mysqlEnum('role', ['user', 'admin']).default('user').notNull(),
  /** Set when the address was confirmed by link (or came from Google, which already did). */
  emailVerifiedAt: timestamp('email_verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * One-time tokens for e-mail verification and password reset. Only the SHA-256 of the token
 * is stored, so a database leak does not hand out working links; a token is spent on first
 * use and expires on its own.
 */
export const authTokens = mysqlTable('auth_tokens', {
  id: int('id').primaryKey().autoincrement(),
  userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: mysqlEnum('kind', ['verify_email', 'reset_password']).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userKindIdx: index('auth_tokens_user_kind_idx').on(t.userId, t.kind),
}));

export const categories = mysqlTable('categories', {
  id: int('id').primaryKey().autoincrement(),
  nameKa: varchar('name_ka', { length: 255 }).notNull(),
  nameEn: varchar('name_en', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  icon: varchar('icon', { length: 100 }),
  phase: int('phase').notNull(),
  calculationType: mysqlEnum('calculation_type', [
    'per_m2_floor',
    'per_m2_wall',
    'per_m2_ceiling',
    'per_linear_m',
    'per_unit',
    'per_room',
    'fixed',
  ]).notNull(),
  isVisible: boolean('is_visible').default(true).notNull(),
  isFurniture: boolean('is_furniture').default(false).notNull(),
  sortOrder: int('sort_order').default(0),
});

export const stores = mysqlTable('stores', {
  id: int('id').primaryKey().autoincrement(),
  // Unique so the seed's onDuplicateKeyUpdate has a key to match on — without it, re-running
  // the seed silently inserted a second copy of every store.
  nameKa: varchar('name_ka', { length: 255 }).notNull().unique(),
  logoUrl: varchar('logo_url', { length: 500 }),
  websiteUrl: varchar('website_url', { length: 500 }),
  phone: varchar('phone', { length: 50 }),
  address: varchar('address', { length: 500 }),
  city: varchar('city', { length: 100 }),
  rating: decimal('rating', { precision: 3, scale: 2 }).default('4.50'),
  reviewCount: int('review_count').default(0),
  deliveryDays: int('delivery_days').default(3),
  deliveryFeeGel: decimal('delivery_fee_gel', { precision: 8, scale: 2 }).default('0.00'),
  descriptionKa: text('description_ka'),
  commissionRate: decimal('commission_rate', { precision: 5, scale: 2 }).default('5.00'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = mysqlTable('products', {
  id: int('id').primaryKey().autoincrement(),
  categoryId: int('category_id').notNull().references(() => categories.id),
  storeId: int('store_id').references(() => stores.id),
  nameKa: varchar('name_ka', { length: 500 }).notNull(),
  descriptionKa: text('description_ka'),
  slug: varchar('slug', { length: 500 }).notNull().unique(),
  sku: varchar('sku', { length: 100 }),
  pricePerUnit: decimal('price_per_unit', { precision: 10, scale: 2 }).notNull(),
  unit: mysqlEnum('unit', ['m2', 'linear_m', 'piece', 'liter', 'kg', 'pack', 'set']).notNull(),
  coveragePerUnit: decimal('coverage_per_unit', { precision: 10, scale: 4 }),
  brand: varchar('brand', { length: 255 }),
  imageUrl: varchar('image_url', { length: 500 }),
  images: json('images'),
  specs: json('specs'),
  tags: json('tags'),
  /** Style ids this product belongs to, e.g. ['scandinavian','modern']. See lib/design/styles.ts */
  styleTags: json('style_tags'),
  /** Archetype the layout engine places this product as. See ARCHETYPES in lib/design/catalog.ts. */
  model3dKind: varchar('model_3d_kind', { length: 64 }),
  /** Optional GLB. When set, the viewer loads it instead of the procedural mesh. */
  model3dUrl: varchar('model_3d_url', { length: 500 }),
  model3dStatus: mysqlEnum('model_3d_status', ['none', 'pending', 'ready', 'failed'])
    .default('none')
    .notNull(),
  /** Tileable texture for surface products (floor, wall, tile). */
  textureUrl: varchar('texture_url', { length: 500 }),
  /** Dominant colour, used to tint the procedural mesh so it matches the real product. */
  colorHex: varchar('color_hex', { length: 9 }),
  /** Real-world dimensions in cm — drive scale, clearance and collision in autoLayout. */
  widthCm: int('width_cm'),
  depthCm: int('depth_cm'),
  heightCm: int('height_cm'),
  isActive: boolean('is_active').default(true).notNull(),
  isFeatured: boolean('is_featured').default(false).notNull(),
  sortOrder: int('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // The public catalogue lists active products by category, featured first; the studio
  // pulls every active product in the design categories. Both filter on these columns.
  activeCategoryIdx: index('products_active_category_idx').on(t.isActive, t.categoryId, t.isFeatured),
  kindIdx: index('products_model3d_kind_idx').on(t.model3dKind),
}));

/**
 * The calculator's rate book — every per-m² material quantity and labour price the
 * estimate is built from, editable in admin because market prices move faster than code.
 * Seeded from `lib/calculator/constants.ts`; those constants remain the fallback when the
 * table is empty.
 */
export const rates = mysqlTable('rates', {
  id: int('id').autoincrement().primaryKey(),
  kind: mysqlEnum('kind', ['material', 'labour']).notNull(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  labelKa: varchar('label_ka', { length: 255 }).notNull(),
  phase: int('phase').notNull(),
  /** Materials: m2 / linear_m / piece / liter / kg / m3. Labour: m2 / unit. */
  unit: varchar('unit', { length: 20 }).notNull(),
  /** Materials only: what the quantity is proportional to. */
  basis: varchar('basis', { length: 20 }),
  qtyPerM2: decimal('qty_per_m2', { precision: 10, scale: 4 }),
  wasteFactorPct: decimal('waste_factor_pct', { precision: 6, scale: 2 }),
  /** Materials: estimated price per unit. Labour: price per m² or per unit. */
  pricePerUnit: decimal('price_per_unit', { precision: 12, scale: 2 }).notNull(),
  linkedCategorySlug: varchar('linked_category_slug', { length: 100 }),
  sortOrder: int('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

export type Rate = typeof rates.$inferSelect;

export const workers = mysqlTable('workers', {
  id: int('id').primaryKey().autoincrement(),
  nameKa: varchar('name_ka', { length: 255 }).notNull(),
  specialty: varchar('specialty', { length: 255 }).notNull(),
  specialtySlug: varchar('specialty_slug', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  pricePerM2: decimal('price_per_m2', { precision: 8, scale: 2 }),
  pricePerUnit: decimal('price_per_unit', { precision: 8, scale: 2 }),
  priceUnit: mysqlEnum('price_unit', ['m2', 'unit', 'fixed']).notNull(),
  rating: decimal('rating', { precision: 3, scale: 2 }).default('5.00'),
  reviewCount: int('review_count').default(0),
  bio: text('bio'),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  isVerified: boolean('is_verified').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  activeSpecialtyIdx: index('workers_active_specialty_idx').on(t.isActive, t.specialtySlug),
}));

export const projects = mysqlTable('projects', {
  id: int('id').primaryKey().autoincrement(),
  userId: int('user_id').references(() => users.id),
  sessionId: varchar('session_id', { length: 255 }),
  nameKa: varchar('name_ka', { length: 255 }).default('ჩემი პროექტი'),
  homeState: mysqlEnum('home_state', ['black_frame', 'white_frame', 'green_frame']).notNull(),
  totalM2: decimal('total_m2', { precision: 8, scale: 2 }).notNull(),
  rooms: json('rooms').notNull(),
  selectedProducts: json('selected_products'),
  selectedFurniture: json('selected_furniture'),
  totalMaterialsCost: decimal('total_materials_cost', { precision: 12, scale: 2 }),
  totalFurnitureCost: decimal('total_furniture_cost', { precision: 12, scale: 2 }),
  totalWorkersCost: decimal('total_workers_cost', { precision: 12, scale: 2 }),
  totalCost: decimal('total_cost', { precision: 12, scale: 2 }),
  status: mysqlEnum('status', ['draft', 'saved', 'submitted']).default('draft'),
  /** 'full' = renovation + design, 'design_only' = interior design of a finished home. */
  mode: mysqlEnum('mode', ['full', 'design_only']).default('full').notNull(),
  /** Chosen interior style id. See lib/design/styles.ts */
  styleId: varchar('style_id', { length: 32 }),
  budgetGel: decimal('budget_gel', { precision: 12, scale: 2 }),
  /** Uploaded 2D floor plan image. */
  floorPlanUrl: varchar('floor_plan_url', { length: 500 }),
  /** Parsed FloorPlan (rooms as polygons + openings + scale). See lib/design/types.ts */
  plan: json('plan'),
  /** DesignScene — surface finishes and furniture placements. See lib/design/types.ts */
  scene: json('scene'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // Profile and admin lists: a user's projects, newest first.
  userCreatedIdx: index('projects_user_created_idx').on(t.userId, t.createdAt),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Worker = typeof workers.$inferSelect;
export type NewWorker = typeof workers.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
