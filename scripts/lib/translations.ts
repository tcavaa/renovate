/**
 * English and Russian names for the seeded catalogue.
 *
 * The seed data is written in Georgian; these maps give the same rows their other two
 * languages so the English and Russian interfaces show translated content instead of Georgian
 * with a different chrome. Keyed by slug (categories, products) or by the Georgian name
 * (stores, workers). Used by `pnpm db:seed` and by `pnpm db:backfill-translations`.
 */

export const CATEGORY_RU: Record<string, string> = {
  'floor-tiles': 'Напольная плитка',
  'wall-tiles': 'Настенная плитка',
  laminate: 'Ламинат',
  doors: 'Двери',
  windows: 'Окна',
  paint: 'Краска',
  sanitary: 'Сантехника',
  lighting: 'Освещение',
  'sockets-switches': 'Розетки и выключатели',
  beds: 'Кровати',
  sofas: 'Диваны и кресла',
  tables: 'Столы',
  chairs: 'Стулья',
  wardrobes: 'Шкафы',
  'kitchen-furniture': 'Кухонная мебель',
  storage: 'Хранение и полки',
  rugs: 'Ковры',
  decor: 'Декор',
};

export const PRODUCT_I18N: Record<string, { en: string; ru: string }> = {
  'porcelain-tile-60x60-beige': { en: 'Porcelain tile 60×60 — beige', ru: 'Керамогранит 60×60 — бежевый' },
  'ceramic-tile-60x120-anthracite': { en: 'Ceramic tile 60×120 — anthracite', ru: 'Керамическая плитка 60×120 — антрацит' },
  'marble-effect-tile-80x80': { en: 'Marble-effect tile 80×80', ru: 'Плитка под мрамор 80×80' },
  'small-tile-30x30-grey': { en: 'Small tile 30×30 — grey', ru: 'Малая плитка 30×30 — серая' },
  'wall-tile-glossy-white-25x40': { en: 'Wall tile 25×40 — glossy white', ru: 'Настенная плитка 25×40 — белая глянцевая' },
  'wall-tile-marble-30x60': { en: 'Wall tile 30×60 — marble', ru: 'Настенная плитка 30×60 — мрамор' },
  'wall-tile-mosaic-blue': { en: 'Mosaic — light blue', ru: 'Мозаика — голубая' },
  'wall-tile-textured-grey': { en: 'Textured tile — grey', ru: 'Фактурная плитка — серая' },
  'laminate-oak-classic-8mm': { en: 'Laminate 8 mm — classic oak', ru: 'Ламинат 8 мм — классический дуб' },
  'laminate-walnut-12mm': { en: 'Laminate 12 mm — walnut', ru: 'Ламинат 12 мм — орех' },
  'laminate-grey-10mm': { en: 'Laminate 10 mm — grey', ru: 'Ламинат 10 мм — серый' },
  'laminate-light-oak-budget': { en: 'Laminate 7 mm — budget', ru: 'Ламинат 7 мм — бюджетный' },
  'door-mdf-white-classic': { en: 'Interior door MDF — classic white', ru: 'Межкомнатная дверь МДФ — белая классика' },
  'door-oak-modern': { en: 'Interior door oak — modern', ru: 'Межкомнатная дверь дуб — модерн' },
  'door-glass-aluminum': { en: 'Glass door with aluminium frame', ru: 'Стеклянная дверь в алюминиевой раме' },
  'door-budget-laminated': { en: 'Laminated door — budget', ru: 'Ламинированная дверь — бюджетная' },
  'window-pvc-double-1200x1400': { en: 'PVC window, double glazing 120×140', ru: 'Окно ПВХ, двойное остекление 120×140' },
  'window-pvc-triple-1500x1500': { en: 'PVC window, triple glazing 150×150', ru: 'Окно ПВХ, тройное остекление 150×150' },
  'window-aluminum-large': { en: 'Aluminium window — large format', ru: 'Алюминиевое окно — большой формат' },
  'window-budget-pvc-small': { en: 'PVC window budget 90×120', ru: 'Окно ПВХ бюджетное 90×120' },
  'paint-tikkurila-white-9l': { en: 'Tikkurila paint — white 9 l', ru: 'Краска Tikkurila — белая 9 л' },
  'paint-dulux-color-3l': { en: 'Dulux paint — colour 3 l', ru: 'Краска Dulux — цветная 3 л' },
  'paint-marshall-eco-5l': { en: 'Marshall eco paint 5 l', ru: 'Экологичная краска Marshall 5 л' },
  'paint-budget-white-10l': { en: 'Budget white paint 10 l', ru: 'Бюджетная белая краска 10 л' },
  'toilet-roca-suspended': { en: 'Roca toilet — wall-hung', ru: 'Унитаз Roca — подвесной' },
  'sink-villeroy-double': { en: 'Villeroy & Boch double sink', ru: 'Раковина Villeroy & Boch двойная' },
  'shower-cabin-glass': { en: 'Shower screen — glass 90×90', ru: 'Душевая перегородка — стекло 90×90' },
  'toilet-budget': { en: 'Toilet — budget', ru: 'Унитаз — бюджетный' },
  'pendant-lamp-modern-black': { en: 'Pendant light — black modern', ru: 'Подвесной светильник — чёрный модерн' },
  'led-spot-set-6': { en: 'LED spotlight set (6 pcs)', ru: 'Набор LED-спотов (6 шт.)' },
  'wall-lamp-elegant': { en: 'Wall lamp — elegant', ru: 'Настенный светильник — элегант' },
  'chandelier-crystal': { en: 'Crystal chandelier — large', ru: 'Хрустальная люстра — большая' },
  'socket-schneider-white': { en: 'Schneider socket — white', ru: 'Розетка Schneider — белая' },
  'switch-legrand-elegant': { en: 'Legrand switch — elegant', ru: 'Выключатель Legrand — элегант' },
  'usb-socket-modern': { en: 'USB socket — modern', ru: 'USB-розетка — модерн' },
  'socket-budget-set-10': { en: 'Socket set (10 pcs)', ru: 'Набор розеток (10 шт.)' },
  'bed-double-160-oak': { en: 'Double bed 160×200 — oak', ru: 'Двуспальная кровать 160×200 — дуб' },
  'bed-double-180-white': { en: 'Double bed 180×200 — white', ru: 'Двуспальная кровать 180×200 — белая' },
  'bed-single-90': { en: 'Single bed 90×200', ru: 'Односпальная кровать 90×200' },
  'bed-premium-metal': { en: 'Premium bed — wrought steel 160×200', ru: 'Премиум кровать — кованая сталь 160×200' },
  'sofa-corner-grey': { en: 'Corner sofa 3+2 — grey', ru: 'Угловой диван 3+2 — серый' },
  'sofa-3-seat-brown': { en: 'Three-seat sofa — brown', ru: 'Трёхместный диван — коричневый' },
  'armchair-blue': { en: 'Armchair — blue', ru: 'Кресло — синее' },
  'puff-extra': { en: 'Pouffe — extra seat', ru: 'Пуф — дополнительное место' },
  'dining-table-oak-6': { en: 'Dining table, 6 seats — oak', ru: 'Обеденный стол на 6 мест — дуб' },
  'coffee-table-modern': { en: 'Coffee table — modern', ru: 'Журнальный столик — модерн' },
  'dining-table-extendable': { en: 'Extendable dining table', ru: 'Раздвижной обеденный стол' },
  'side-table-small': { en: 'Small side table', ru: 'Маленький приставной столик' },
  'chair-dining-set-4': { en: 'Dining chairs set (4 pcs)', ru: 'Набор обеденных стульев (4 шт.)' },
  'chair-office-ergonomic': { en: 'Ergonomic office chair', ru: 'Эргономичное офисное кресло' },
  'chair-bar-set-2': { en: 'Bar stools set (2 pcs)', ru: 'Набор барных стульев (2 шт.)' },
  'chair-accent-velvet': { en: 'Accent chair — velvet', ru: 'Акцентный стул — бархат' },
  'wardrobe-3-doors-oak': { en: 'Wardrobe, 3 doors — oak', ru: 'Шкаф трёхдверный — дуб' },
  'wardrobe-sliding-mirror': { en: 'Sliding-door wardrobe with mirror', ru: 'Шкаф-купе с зеркалом' },
  'wardrobe-2-doors-white': { en: 'Wardrobe, 2 doors — white', ru: 'Шкаф двухдверный — белый' },
  'wardrobe-walk-in-large': { en: 'Walk-in wardrobe — large', ru: 'Гардеробная — большая' },
  'kitchen-set-3m-classic': { en: 'Kitchen set 3 m — classic', ru: 'Кухонный гарнитур 3 м — классика' },
  'kitchen-island-modern': { en: 'Kitchen island — modern', ru: 'Кухонный остров — модерн' },
  'kitchen-set-corner': { en: 'Corner kitchen set', ru: 'Угловой кухонный гарнитур' },
  'kitchen-budget-set': { en: 'Budget kitchen set', ru: 'Бюджетный кухонный гарнитур' },
  'shelf-wall-modern': { en: 'Wall shelf — modern', ru: 'Настенная полка — модерн' },
  'shelf-bookcase-large': { en: 'Bookcase — large', ru: 'Книжный шкаф — большой' },
  'storage-cube-set': { en: 'Storage cubes — set', ru: 'Кубы для хранения — набор' },
  'shoe-cabinet': { en: 'Shoe cabinet', ru: 'Обувница' },
};

/** Store names, keyed by the Georgian name the seeds use as the unique key. */
export const STORE_I18N: Record<string, { en: string; ru: string }> = {
  'რემონტი.ge ოფიციალური მაღაზია': { en: 'remonti.ge official store', ru: 'Официальный магазин remonti.ge' },
  'ქართული ავეჯი': { en: 'Georgian Furniture', ru: 'Грузинская мебель' },
  'Nordic Home Tbilisi': { en: 'Nordic Home Tbilisi', ru: 'Nordic Home Тбилиси' },
  'LOFT 42': { en: 'LOFT 42', ru: 'LOFT 42' },
  'Domus Interior': { en: 'Domus Interior', ru: 'Domus Interior' },
  'ანტიკვარი — ვინტაჟის სალონი': { en: 'Antikvari — vintage salon', ru: 'Антиквари — салон винтажа' },
  'ლუმინა განათება': { en: 'Lumina Lighting', ru: 'Люмина Освещение' },
  'ტექსტილ+ ხალიჩები': { en: 'Textile+ Rugs', ru: 'Текстиль+ Ковры' },
  'სან-პლუს სანტექნიკა': { en: 'San-Plus Sanitary', ru: 'Сан-Плюс Сантехника' },
};

/** Worker names transliterated, keyed by the Georgian name. */
export const WORKER_I18N: Record<string, { en: string; ru: string }> = {
  'გიორგი მესხი': { en: 'Giorgi Meskhi', ru: 'Гиорги Месхи' },
  'დავით ბერიძე': { en: 'Davit Beridze', ru: 'Давит Беридзе' },
  'ლევან წერეთელი': { en: 'Levan Tsereteli', ru: 'Леван Церетели' },
  'ნიკა ჯავახიშვილი': { en: 'Nika Javakhishvili', ru: 'Ника Джавахишвили' },
  'რევაზ კობახიძე': { en: 'Revaz Kobakhidze', ru: 'Реваз Кобахидзе' },
  'ზურაბ კვარაცხელია': { en: 'Zurab Kvaratskhelia', ru: 'Зураб Кварацхелия' },
};

/** `tx-floor-tile-terracotta` → `Floor tile terracotta`, for texture products with no author name. */
export function humanizeSlug(slug: string): string {
  const words = slug.replace(/^(tx|pm|stock)-/, '').split('-').filter(Boolean);
  if (words.length === 0) return slug;
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}
