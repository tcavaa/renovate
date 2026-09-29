import {
  mysqlTable,
  int,
  varchar,
  text,
  decimal,
  boolean,
  timestamp,
  mysqlEnum,
  index,
  primaryKey,
  uniqueIndex,
  type AnyMySqlColumn,
} from 'drizzle-orm/mysql-core';
import { json } from './json';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  /**
   * `store`, `worker` and `team` are partner accounts: they see the partner portal, not the
   * admin. `agent_orders` and `agent_catalog` are staff — they see the admin, each with the
   * part of it their job needs (`lib/auth/roles.ts`).
   */
  role: mysqlEnum('role', ['user', 'admin', 'agent_orders', 'agent_catalog', 'store', 'worker', 'team']).default('user').notNull(),
  /** The store a `store` account manages — its orders, its products. */
  storeId: int('store_id').references(() => stores.id, { onDelete: 'set null' }),
  /** The worker profile a `worker` account manages. */
  workerId: int('worker_id').references(() => workers.id, { onDelete: 'set null' }),
  /** The team a `team` account speaks for — its foreman. */
  teamId: int('team_id').references((): AnyMySqlColumn => teams.id, { onDelete: 'set null' }),
  /** Set when the address was confirmed by link (or came from Google, which already did). */
  emailVerifiedAt: timestamp('email_verified_at'),
  /**
   * Admin's switch. A deactivated account cannot sign in, and a session it already has ends at
   * its next request (`lib/auth/accountClaims.ts` re-reads the row) — the row, its projects and
   * its orders stay.
   */
  isActive: boolean('is_active').default(true).notNull(),
  /** The last successful sign-in, password or social. */
  lastLoginAt: timestamp('last_login_at'),
  /**
   * The person's own contact, from their profile (`/profile?view=account`) or kept from a
   * checkout ("make it my default address"): a checkout or a booking asks only for what is
   * missing here. The address is the default delivery address — city, street and number,
   * postal code (optional).
   */
  phone: varchar('phone', { length: 50 }),
  addressCity: varchar('address_city', { length: 120 }),
  addressLine: varchar('address_line', { length: 255 }),
  addressPostalCode: varchar('address_postal_code', { length: 20 }),
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

/**
 * The catalogue's categories — one tree (`lib/catalog/tree.ts`): each row under its parent,
 * three levels at most, siblings in `sortOrder`. A product sits in one category at any level;
 * a category stands for its whole subtree wherever it is listed.
 */
export const categories = mysqlTable('categories', {
  id: int('id').primaryKey().autoincrement(),
  /** The category above; null at the top. A category with children cannot be deleted. */
  parentId: int('parent_id').references((): AnyMySqlColumn => categories.id, { onDelete: 'restrict' }),
  nameKa: varchar('name_ka', { length: 255 }).notNull(),
  nameEn: varchar('name_en', { length: 255 }).notNull(),
  nameRu: varchar('name_ru', { length: 255 }),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  /** A lucide icon's kebab name, or one of the studio's own (`STUDIO_ICONS`). */
  icon: varchar('icon', { length: 100 }),
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
  /** Offered as a tab in the calculator, with its whole subtree's products. */
  inCalculator: boolean('in_calculator').default(false).notNull(),
  /** The 3D kind whose products belong here: the model pipeline and people's own uploads put them in it. */
  model3dKind: varchar('model_3d_kind', { length: 64 }),
  sortOrder: int('sort_order').default(0),
}, (t) => ({
  parentIdx: index('categories_parent_idx').on(t.parentId),
}));

/**
 * The studio's rooms — the top row of the furniture shelf (living room, bedroom, …) — made,
 * named, ordered and given icons by admin. Each lists the categories it shows
 * (`shelfRoomCategories`) and the plan's room types it is for: the shelf opens on it when a
 * room of that type is in focus.
 */
export const shelfRooms = mysqlTable('shelf_rooms', {
  id: int('id').primaryKey().autoincrement(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  nameKa: varchar('name_ka', { length: 255 }).notNull(),
  nameEn: varchar('name_en', { length: 255 }).notNull(),
  nameRu: varchar('name_ru', { length: 255 }),
  icon: varchar('icon', { length: 100 }),
  /** `RoomType`s from `lib/calculator/types`. */
  roomTypes: json<string[]>('room_types'),
  isVisible: boolean('is_visible').default(true).notNull(),
  sortOrder: int('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

/** Which categories a studio room shows, in its order. A category may be in several rooms. */
export const shelfRoomCategories = mysqlTable('shelf_room_categories', {
  shelfRoomId: int('shelf_room_id').notNull().references(() => shelfRooms.id, { onDelete: 'cascade' }),
  categoryId: int('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  sortOrder: int('sort_order').default(0).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.shelfRoomId, t.categoryId] }),
  categoryIdx: index('shelf_room_categories_category_idx').on(t.categoryId),
}));

export const stores = mysqlTable('stores', {
  id: int('id').primaryKey().autoincrement(),
  // Unique so the seed's onDuplicateKeyUpdate has a key to match on — without it, re-running
  // the seed silently inserted a second copy of every store.
  nameKa: varchar('name_ka', { length: 255 }).notNull().unique(),
  nameEn: varchar('name_en', { length: 255 }),
  nameRu: varchar('name_ru', { length: 255 }),
  logoUrl: varchar('logo_url', { length: 500 }),
  websiteUrl: varchar('website_url', { length: 500 }),
  phone: varchar('phone', { length: 50 }),
  /** Where new orders are announced. Blank means the partner only sees them in the portal. */
  email: varchar('email', { length: 255 }),
  address: varchar('address', { length: 500 }),
  city: varchar('city', { length: 100 }),
  rating: decimal('rating', { precision: 3, scale: 2 }).default('4.50'),
  reviewCount: int('review_count').default(0),
  deliveryDays: int('delivery_days').default(3),
  deliveryFeeGel: decimal('delivery_fee_gel', { precision: 8, scale: 2 }).default('0.00'),
  descriptionKa: text('description_ka'),
  descriptionEn: text('description_en'),
  descriptionRu: text('description_ru'),
  /** Platform commission on this store's orders, percent. Null = the platform default. */
  commissionRate: decimal('commission_rate', { precision: 5, scale: 2 }).default('5.00'),
  /**
   * A store that registered itself starts `pending` and is invisible — no products in the
   * catalogue, no store in the sidebar — until admin approves it. Rows admin creates and
   * every row from before self-registration are `approved`.
   */
  approvalStatus: mysqlEnum('approval_status', ['pending', 'approved', 'rejected']).default('approved').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = mysqlTable('products', {
  id: int('id').primaryKey().autoincrement(),
  categoryId: int('category_id').notNull().references(() => categories.id),
  storeId: int('store_id').references(() => stores.id),
  /**
   * A piece of furniture a person uploaded for their own flats — a model of their own, or a
   * photo waiting to be made into one. Theirs alone: every public query leaves owned
   * products out, the design catalogue adds the caller's own, and the seeds never touch them.
   */
  ownerUserId: int('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
  nameKa: varchar('name_ka', { length: 500 }).notNull(),
  // Translations fall back through en → ka on the client (see `localizedName`).
  nameEn: varchar('name_en', { length: 500 }),
  nameRu: varchar('name_ru', { length: 500 }),
  descriptionKa: text('description_ka'),
  descriptionEn: text('description_en'),
  descriptionRu: text('description_ru'),
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
  ownerIdx: index('products_owner_idx').on(t.ownerUserId),
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
  nameEn: varchar('name_en', { length: 255 }),
  nameRu: varchar('name_ru', { length: 255 }),
  specialty: varchar('specialty', { length: 255 }).notNull(),
  specialtySlug: varchar('specialty_slug', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  /** Where new bookings are announced. */
  email: varchar('email', { length: 255 }),
  /** Platform commission on this worker's bookings, percent. Null = the platform default. */
  commissionRate: decimal('commission_rate', { precision: 5, scale: 2 }).default('5.00'),
  pricePerM2: decimal('price_per_m2', { precision: 8, scale: 2 }),
  pricePerUnit: decimal('price_per_unit', { precision: 8, scale: 2 }),
  priceUnit: mysqlEnum('price_unit', ['m2', 'unit', 'fixed']).notNull(),
  rating: decimal('rating', { precision: 3, scale: 2 }).default('5.00'),
  reviewCount: int('review_count').default(0),
  bio: text('bio'),
  bioEn: text('bio_en'),
  bioRu: text('bio_ru'),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  city: varchar('city', { length: 100 }),
  experienceYears: int('experience_years'),
  completedJobs: int('completed_jobs').default(0),
  isVerified: boolean('is_verified').default(false).notNull(),
  /** Self-registered workers wait here (`pending`, inactive) until admin approves them. */
  approvalStatus: mysqlEnum('approval_status', ['pending', 'approved', 'rejected']).default('approved').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  activeSpecialtyIdx: index('workers_active_specialty_idx').on(t.isActive, t.specialtySlug),
}));

/** A client's review of a worker; `workers.rating` / `reviewCount` are kept as aggregates. */
/**
 * A brigade — ბრიგადა — the unit a Georgian renovation is actually hired as.
 *
 * Nobody books a tiler, then an electrician, then a plasterer and hopes the dates line up:
 * they hire a team that already has all of them and a foreman who answers the phone. A team
 * is therefore the partner a whole job is sent to, beside the stores that supply it, and the
 * trades it covers come from the workers in it (`team_members`).
 */
export const teams = mysqlTable('teams', {
  id: int('id').primaryKey().autoincrement(),
  nameKa: varchar('name_ka', { length: 255 }).notNull(),
  nameEn: varchar('name_en', { length: 255 }),
  nameRu: varchar('name_ru', { length: 255 }),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  descriptionKa: text('description_ka'),
  descriptionEn: text('description_en'),
  descriptionRu: text('description_ru'),
  /** The foreman — who the customer talks to. */
  leadName: varchar('lead_name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  /** Where a job sent to the team is announced. */
  email: varchar('email', { length: 255 }),
  logoUrl: varchar('logo_url', { length: 500 }),
  city: varchar('city', { length: 100 }),
  rating: decimal('rating', { precision: 3, scale: 2 }).default('5.00'),
  reviewCount: int('review_count').default(0),
  completedJobs: int('completed_jobs').default(0),
  experienceYears: int('experience_years'),
  /** What the team charges over the trades' own rates, percent; null = nothing. */
  markupPct: decimal('markup_pct', { precision: 5, scale: 2 }),
  /** Platform commission on this team's jobs, percent. Null = the platform default. */
  commissionRate: decimal('commission_rate', { precision: 5, scale: 2 }).default('5.00'),
  /** How much work the team can take on at once; the directory says who is free. */
  capacityJobs: int('capacity_jobs').default(1),
  isVerified: boolean('is_verified').default(false).notNull(),
  /** Self-registered teams wait here (`pending`, inactive) until admin approves them. */
  approvalStatus: mysqlEnum('approval_status', ['pending', 'approved', 'rejected']).default('approved').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  activeCityIdx: index('teams_active_city_idx').on(t.isActive, t.city),
}));

/** Which workers a team is made of; the trades it covers are theirs. */
export const teamMembers = mysqlTable('team_members', {
  id: int('id').primaryKey().autoincrement(),
  teamId: int('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  workerId: int('worker_id').notNull().references(() => workers.id, { onDelete: 'cascade' }),
  /** The foreman, who answers for the job. */
  isLead: boolean('is_lead').default(false).notNull(),
  sortOrder: int('sort_order').default(0).notNull(),
}, (t) => ({
  teamIdx: index('team_members_team_idx').on(t.teamId),
  workerIdx: index('team_members_worker_idx').on(t.workerId),
}));

export const workerReviews = mysqlTable('worker_reviews', {
  id: int('id').primaryKey().autoincrement(),
  workerId: int('worker_id').notNull().references(() => workers.id, { onDelete: 'cascade' }),
  authorName: varchar('author_name', { length: 255 }).notNull(),
  rating: int('rating').notNull(),
  textKa: text('text_ka'),
  textEn: text('text_en'),
  textRu: text('text_ru'),
  /** What the job was, e.g. "bathroom tiling, 8 m²". */
  jobKa: varchar('job_ka', { length: 255 }),
  jobEn: varchar('job_en', { length: 255 }),
  jobRu: varchar('job_ru', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  workerIdx: index('worker_reviews_worker_idx').on(t.workerId, t.createdAt),
}));

/** One finished job in a worker's portfolio. */
export const workerWorks = mysqlTable('worker_works', {
  id: int('id').primaryKey().autoincrement(),
  workerId: int('worker_id').notNull().references(() => workers.id, { onDelete: 'cascade' }),
  titleKa: varchar('title_ka', { length: 255 }).notNull(),
  titleEn: varchar('title_en', { length: 255 }),
  titleRu: varchar('title_ru', { length: 255 }),
  descriptionKa: text('description_ka'),
  descriptionEn: text('description_en'),
  descriptionRu: text('description_ru'),
  imageUrl: varchar('image_url', { length: 500 }),
  areaM2: decimal('area_m2', { precision: 8, scale: 2 }),
  city: varchar('city', { length: 100 }),
  year: int('year'),
  sortOrder: int('sort_order').default(0).notNull(),
}, (t) => ({
  workerIdx: index('worker_works_worker_idx').on(t.workerId, t.sortOrder),
}));

export const projects = mysqlTable('projects', {
  id: int('id').primaryKey().autoincrement(),
  userId: int('user_id').references(() => users.id),
  sessionId: varchar('session_id', { length: 255 }),
  nameKa: varchar('name_ka', { length: 255 }).default('ჩემი პროექტი'),
  /**
   * The home's condition. NULL until it is chosen: a project is created, named, before its
   * first step (`POST /api/projects/create`), and the calculator asks for the condition there.
   */
  homeState: mysqlEnum('home_state', ['old_renovation', 'black_frame', 'white_frame', 'green_frame']),
  totalM2: decimal('total_m2', { precision: 8, scale: 2 }).notNull(),
  rooms: json('rooms').notNull(),
  selectedProducts: json('selected_products'),
  selectedFurniture: json('selected_furniture'),
  /**
   * What the person made of the calculator's estimate on its summary: `{ excluded, quantities }`
   * by line key (`lib/design/ticks`). The estimate itself is never stored — it is worked out
   * again from the rooms and the picks — so this is all that is needed to show the original
   * beside the edit. The design half keeps its own in `scene`.
   */
  calculatorEdits: json('calculator_edits'),
  /**
   * The calculator's own drawing board, `{ plan, floorPlanUrl, finishes }`: the walls, doors and
   * windows drawn on its plan step and the finishes laid on its placement step. Not `plan` —
   * `plan IS NOT NULL` is what says a project has a 3D design.
   */
  calculatorBoard: json('calculator_board'),
  /**
   * How many times each half has been written. A save names the revision it was made from
   * and is refused (409) when the row has moved on — another tab, another computer — instead
   * of writing an older copy over a newer one; the browser's cache of a half is current when
   * it is at the row's revision (`lib/flow/projectSync`). A rename or an order is neither.
   */
  calculatorRev: int('calculator_rev').default(0).notNull(),
  designRev: int('design_rev').default(0).notNull(),
  /**
   * The id of the last save of each half (made by the browser). A save whose answer never
   * arrived — a dropped connection, a reload mid-write — still moved the revision on; the next
   * save from that browser names it, and is recognised as following its own write rather than
   * refused as a conflict with somebody else's.
   */
  calculatorSaveId: varchar('calculator_save_id', { length: 36 }),
  designSaveId: varchar('design_save_id', { length: 36 }),
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
  /** DesignVersion[] — the kept versions of the flat (version 01 is the existing house). */
  versions: json('versions'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // Profile and admin lists: a user's projects, newest first.
  userCreatedIdx: index('projects_user_created_idx').on(t.userId, t.createdAt),
}));

/**
 * A photo taken in the studio and the realistic render requested from it.
 *
 * `sourceUrl` is the studio's own screenshot, stored the moment the user asks for a render
 * and downloadable at once; `renderUrl` is filled in when the render is produced (by hand
 * or by an image model — there is no generator wired in yet, so rows wait in `queued`).
 * `camera` keeps the view so the render can be redone from the same spot.
 */
export const projectRenders = mysqlTable('project_renders', {
  id: int('id').primaryKey().autoincrement(),
  projectId: int('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: int('user_id').references(() => users.id, { onDelete: 'set null' }),
  sourceUrl: varchar('source_url', { length: 500 }).notNull(),
  renderUrl: varchar('render_url', { length: 500 }),
  status: mysqlEnum('status', ['queued', 'processing', 'ready', 'failed']).default('queued').notNull(),
  /** Room in focus when the photo was taken, if any. */
  roomName: varchar('room_name', { length: 255 }),
  camera: json('camera'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  projectIdx: index('project_renders_project_idx').on(t.projectId, t.createdAt),
}));

// ---------------------------------------------------------------------------
// Marketplace: platform fees, partner orders and commissions
// ---------------------------------------------------------------------------

/**
 * One row. What the platform charges: a fee per square metre for a calculation and for a
 * 3D design (paid before the half's hinge — `project_payments`; there is no payment provider
 * yet, the card is a test one), and the default commission on partner stores and workers. A
 * store or worker with its own `commissionRate` overrides the default.
 */
export const platformSettings = mysqlTable('platform_settings', {
  id: int('id').primaryKey().autoincrement(),
  calculatorFeePerM2: decimal('calculator_fee_per_m2', { precision: 8, scale: 2 }).default('2.00').notNull(),
  designFeePerM2: decimal('design_fee_per_m2', { precision: 8, scale: 2 }).default('12.00').notNull(),
  storeCommissionPct: decimal('store_commission_pct', { precision: 5, scale: 2 }).default('5.00').notNull(),
  workerCommissionPct: decimal('worker_commission_pct', { precision: 5, scale: 2 }).default('5.00').notNull(),
  /**
   * The store that supplies the construction materials of the rate book (blocks, plaster,
   * putty, pipes, cable…): a checkout sends the project's material lines to it as an order of
   * their own. NULL = nobody, and those lines are reported as unassigned.
   */
  materialsStoreId: int('materials_store_id').references(() => stores.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

/**
 * A customer placing the order for a whole project: one partner `order` per store the goods
 * come from, and where they go. Totals are snapshots — what was ordered the day it was placed.
 * The platform's fee is paid before the half's hinge now (`project_payments`); `platformFee` is
 * 0 on every checkout since, and holds the fee only on those placed before.
 */
export const checkouts = mysqlTable('checkouts', {
  id: int('id').primaryKey().autoincrement(),
  projectId: int('project_id').references(() => projects.id, { onDelete: 'set null' }),
  userId: int('user_id').references(() => users.id, { onDelete: 'set null' }),
  kind: mysqlEnum('kind', ['calculator', 'design']).notNull(),
  totalM2: decimal('total_m2', { precision: 8, scale: 2 }).notNull(),
  feePerM2: decimal('fee_per_m2', { precision: 8, scale: 2 }).notNull(),
  platformFee: decimal('platform_fee', { precision: 12, scale: 2 }).notNull(),
  goodsTotal: decimal('goods_total', { precision: 12, scale: 2 }).notNull(),
  commissionTotal: decimal('commission_total', { precision: 12, scale: 2 }).notNull(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 50 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }),
  note: text('note'),
  /** Where the goods go (the stores deliver there): the account's default address or one given at checkout. */
  deliveryCity: varchar('delivery_city', { length: 120 }),
  deliveryAddress: varchar('delivery_address', { length: 255 }),
  deliveryPostalCode: varchar('delivery_postal_code', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  createdIdx: index('checkouts_created_idx').on(t.createdAt),
  userIdx: index('checkouts_user_idx').on(t.userId),
}));

/**
 * The platform's fee for one half of a project, paid before the half's hinge — "გამოთვლის
 * დაწყება" in the calculator, the generation in the studio (`HingeDialog`): the half's floor area
 * × the fee per m² of the day. One row per half (a half is paid once). There is no payment
 * provider yet: the card form is a stand-in with a test card and `method` is `test`; the row is
 * the record the revenue report counts. A checkout charges no fee any more — only fees recorded
 * before this table existed are on `checkouts`.
 */
export const projectPayments = mysqlTable('project_payments', {
  id: int('id').primaryKey().autoincrement(),
  projectId: int('project_id').references(() => projects.id, { onDelete: 'set null' }),
  userId: int('user_id').references(() => users.id, { onDelete: 'set null' }),
  kind: mysqlEnum('kind', ['calculator', 'design']).notNull(),
  totalM2: decimal('total_m2', { precision: 8, scale: 2 }).notNull(),
  feePerM2: decimal('fee_per_m2', { precision: 8, scale: 2 }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  /** How it was paid: `test` until a payment provider is wired in. */
  method: varchar('method', { length: 20 }).default('test').notNull(),
  cardLast4: varchar('card_last4', { length: 4 }),
  /** The payment's own reference (the provider's, one day; made up for a test payment). */
  reference: varchar('reference', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  projectKindIdx: uniqueIndex('project_payments_project_kind_idx').on(t.projectId, t.kind),
  createdIdx: index('project_payments_created_idx').on(t.createdAt),
}));

/**
 * What one partner has to fulfil: a store's part of a checkout, or a worker's booking.
 * `subtotal` is the sum of the active items and is recomputed whenever the partner edits
 * them; `commissionPct` is frozen at creation so a later rate change does not rewrite
 * history. Cancelled orders earn nothing.
 */
export const orders = mysqlTable('orders', {
  id: int('id').primaryKey().autoincrement(),
  checkoutId: int('checkout_id').references(() => checkouts.id, { onDelete: 'set null' }),
  projectId: int('project_id').references(() => projects.id, { onDelete: 'set null' }),
  userId: int('user_id').references(() => users.id, { onDelete: 'set null' }),
  partnerType: mysqlEnum('partner_type', ['store', 'worker', 'team']).notNull(),
  storeId: int('store_id').references(() => stores.id, { onDelete: 'set null' }),
  workerId: int('worker_id').references(() => workers.id, { onDelete: 'set null' }),
  teamId: int('team_id').references(() => teams.id, { onDelete: 'set null' }),
  status: mysqlEnum('status', ['new', 'confirmed', 'in_progress', 'done', 'cancelled']).default('new').notNull(),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).default('0.00').notNull(),
  deliveryFee: decimal('delivery_fee', { precision: 10, scale: 2 }).default('0.00').notNull(),
  commissionPct: decimal('commission_pct', { precision: 5, scale: 2 }).default('5.00').notNull(),
  commissionAmount: decimal('commission_amount', { precision: 12, scale: 2 }).default('0.00').notNull(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 50 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }),
  /** What the customer wrote at checkout. */
  customerNote: text('customer_note'),
  /** Where the partner delivers or works: the checkout's (or the booking's) address, copied onto each order. */
  deliveryCity: varchar('delivery_city', { length: 120 }),
  deliveryAddress: varchar('delivery_address', { length: 255 }),
  deliveryPostalCode: varchar('delivery_postal_code', { length: 20 }),
  /** What the partner wrote back — delivery date, a substitution, a question. */
  partnerMessage: text('partner_message'),
  /**
   * The agent's own note: what they checked, who they rang, what they changed and why. It
   * belongs to the platform, not to the customer or the partner, and neither of them sees it.
   */
  staffNote: text('staff_note'),
  /** First time the partner opened it; null = unread badge. */
  viewedAt: timestamp('viewed_at'),
  /**
   * When the partner was given the order. A store's order waits for the platform first: the
   * orders agent checks it with the customer (lines kept or struck, delivery) and confirms it,
   * and only then does the store see it. A brigade's or a worker's booking is sent at once.
   * NULL = still with the platform; the partner portal shows only orders that have one.
   */
  sentAt: timestamp('sent_at'),
  /** When the platform confirmed a store's order, and who did. */
  confirmedAt: timestamp('confirmed_at'),
  confirmedBy: int('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
  /** The delivery fee as the order was placed, so a change the agent makes shows as one. */
  originalDeliveryFee: decimal('original_delivery_fee', { precision: 10, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  storeCreatedIdx: index('orders_store_created_idx').on(t.storeId, t.createdAt),
  workerCreatedIdx: index('orders_worker_created_idx').on(t.workerId, t.createdAt),
  teamCreatedIdx: index('orders_team_created_idx').on(t.teamId, t.createdAt),
  statusIdx: index('orders_status_idx').on(t.status),
  createdIdx: index('orders_created_idx').on(t.createdAt),
}));

/**
 * A line of an order. Names are snapshots so a renamed or deleted product still reads
 * correctly; `removed` keeps a line the partner struck out visible (and out of the totals)
 * instead of deleting it, so the customer can see what changed.
 */
export const orderItems = mysqlTable('order_items', {
  id: int('id').primaryKey().autoincrement(),
  orderId: int('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: int('product_id').references(() => products.id, { onDelete: 'set null' }),
  nameKa: varchar('name_ka', { length: 500 }).notNull(),
  nameEn: varchar('name_en', { length: 500 }),
  nameRu: varchar('name_ru', { length: 500 }),
  categorySlug: varchar('category_slug', { length: 100 }),
  roomName: varchar('room_name', { length: 255 }),
  unit: varchar('unit', { length: 20 }).default('piece').notNull(),
  qty: decimal('qty', { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull(),
  total: decimal('total', { precision: 12, scale: 2 }).notNull(),
  removed: boolean('removed').default(false).notNull(),
  note: text('note'),
  sortOrder: int('sort_order').default(0).notNull(),
  /**
   * The quantity and price the line was ordered at. The customer's view shows every change
   * against them ("3 → 2"); NULL on a line added afterwards, which is how an added line is told.
   */
  originalQty: decimal('original_qty', { precision: 10, scale: 2 }),
  originalUnitPrice: decimal('original_unit_price', { precision: 12, scale: 2 }),
}, (t) => ({
  orderIdx: index('order_items_order_idx').on(t.orderId),
  productIdx: index('order_items_product_idx').on(t.productId),
}));

/**
 * What happened to an order and what was said about it: its creation, the platform's
 * confirmation, status changes, edits of its lines and delivery, the message to the customer —
 * and the comments the platform's people and the partner leave for each other. Never shown to
 * the customer; the partner sees the whole thread except the staff's own note (which is not an
 * event at all).
 */
export const orderEvents = mysqlTable('order_events', {
  id: int('id').primaryKey().autoincrement(),
  orderId: int('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  userId: int('user_id').references(() => users.id, { onDelete: 'set null' }),
  /** The author's role when they wrote it, and their name — the thread outlives role changes. */
  actorRole: varchar('actor_role', { length: 20 }),
  actorName: varchar('actor_name', { length: 255 }),
  kind: mysqlEnum('kind', ['created', 'confirmed', 'status', 'edited', 'message', 'comment']).notNull(),
  /** A comment's or a message's text. */
  body: text('body'),
  /** The facts of a system event: `{ from, to }` for a status, counts for an edit. */
  meta: json('meta'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  orderIdx: index('order_events_order_idx').on(t.orderId, t.createdAt),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type ShelfRoomRow = typeof shelfRooms.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Worker = typeof workers.$inferSelect;
export type NewWorker = typeof workers.$inferInsert;
export type WorkerReview = typeof workerReviews.$inferSelect;
export type WorkerWork = typeof workerWorks.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectPayment = typeof projectPayments.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectRender = typeof projectRenders.$inferSelect;
export type ApprovalStatus = Store['approvalStatus'];
export type PlatformSettingsRow = typeof platformSettings.$inferSelect;
export type Checkout = typeof checkouts.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type OrderStatus = Order['status'];
export type UserRole = User['role'];
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
