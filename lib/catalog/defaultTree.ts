/**
 * The category tree and the studio's rooms the platform starts with.
 *
 * Before the tree the catalogue was 21 flat categories, and the studio's shelf grouped the
 * furniture by room and 3D kind in code. This is the tree they became: a few groups on top
 * (materials, lighting, sanitary ware, furniture, decor), the old categories under them, and
 * under those a subcategory per 3D kind — "Sofas & armchairs" → "Corner sofas" — that the
 * products of that kind were moved into. The studio's rooms list those subcategories the way
 * the shelf listed the kinds (`kindsForRoom`).
 *
 * Migration `0017_category_tree` writes exactly this into a database that had the flat
 * catalogue (`tests/unit/catalog/defaultTree.test.ts` keeps the two in step), and the seeds
 * build it on a fresh one (`scripts/lib/categoryTree.ts`). After that the tree is the admin's:
 * nothing here is read at run time.
 */

import type { RoomType } from '@/lib/calculator/types';
import { SHELF_ROOMS, kindsForRoom } from '@/lib/design/catalog';

export type CategoryCalculationType = 'per_m2_floor' | 'per_m2_wall' | 'per_m2_ceiling' | 'per_linear_m' | 'per_unit' | 'per_room' | 'fixed';

export interface DefaultCategory {
  slug: string;
  /** The parent's slug; null at the top. */
  parent: string | null;
  nameKa: string;
  nameEn: string;
  nameRu: string;
  icon: string;
  sortOrder: number;
  isFurniture: boolean;
  calculationType: CategoryCalculationType;
  /** Offered as a tab in the calculator — the categories it had before the tree. */
  inCalculator: boolean;
  /** The 3D kind whose products belong here. */
  model3dKind: string | null;
  /** One of the flat catalogue's categories: placed in the tree and given an icon, its names kept. */
  existing: boolean;
}

type Spec = Omit<DefaultCategory, 'parent' | 'sortOrder' | 'isFurniture' | 'calculationType' | 'inCalculator' | 'model3dKind' | 'existing'> &
  Partial<Pick<DefaultCategory, 'calculationType' | 'model3dKind' | 'isFurniture'>> & { children?: Spec[]; existing?: boolean };

/** A category the flat catalogue already had (its names as the seeds wrote them). */
const old = (slug: string, nameKa: string, nameEn: string, nameRu: string, icon: string, extra: Partial<Spec> = {}): Spec => ({ slug, nameKa, nameEn, nameRu, icon, existing: true, ...extra });
/** A group or a subcategory the tree adds. */
const add = (slug: string, nameKa: string, nameEn: string, nameRu: string, icon: string, extra: Partial<Spec> = {}): Spec => ({ slug, nameKa, nameEn, nameRu, icon, ...extra });
/** A subcategory for one 3D kind. */
const kind = (model3dKind: string, slug: string, nameKa: string, nameEn: string, nameRu: string, icon: string): Spec => add(slug, nameKa, nameEn, nameRu, icon, { model3dKind });

const TREE: Spec[] = [
  add('materials', 'მასალები', 'Materials', 'Материалы', 'brick-wall', {
    isFurniture: false,
    children: [
      add('tiles', 'ფილები', 'Tiles', 'Плитка', 'grid-3x3', {
        children: [old('floor-tiles', 'იატაკის ფილა', 'Floor Tiles', 'Напольная плитка', 'grid-2x2', { calculationType: 'per_m2_floor' }), old('wall-tiles', 'კედლის ფილა', 'Wall Tiles', 'Настенная плитка', 'layout-grid', { calculationType: 'per_m2_wall' })],
      }),
      add('flooring', 'იატაკი', 'Flooring', 'Напольные покрытия', 'layers', {
        children: [old('laminate', 'ლამინატი', 'Laminate Flooring', 'Ламинат', 'rows-3', { calculationType: 'per_m2_floor' }), old('skirting', 'იატაკის პლინტუსი', 'Skirting boards', 'Напольные плинтусы', 'minus', { calculationType: 'per_linear_m' })],
      }),
      add('walls-ceilings', 'კედლები და ჭერი', 'Walls and ceilings', 'Стены и потолки', 'paint-roller', {
        children: [old('paint', 'საღებავი', 'Paint', 'Краска', 'paint-bucket', { calculationType: 'per_m2_wall' }), old('cornice', 'ჭერის პლინტუსი', 'Cornices', 'Потолочные плинтусы', 'frame', { calculationType: 'per_linear_m' })],
      }),
      old('doors', 'კარები', 'Doors', 'Двери', 'door-closed', {
        children: [kind('door', 'interior-doors', 'შიდა კარები', 'Interior doors', 'Межкомнатные двери', 'door-open'), kind('entrance_door', 'entrance-doors', 'შესასვლელი კარები', 'Entrance doors', 'Входные двери', 'door-closed')],
      }),
      old('windows', 'ფანჯრები', 'Windows', 'Окна', 'app-window', { model3dKind: 'window' }),
      old('sockets-switches', 'როზეტები/ამომრთველები', 'Sockets & Switches', 'Розетки и выключатели', 'plug-zap', {
        children: [kind('socket', 'sockets', 'როზეტები', 'Sockets', 'Розетки', 'plug'), kind('switch', 'switches', 'ამომრთველები', 'Switches', 'Выключатели', 'toggle-left')],
      }),
      old('radiators', 'რადიატორები', 'Radiators', 'Радиаторы', 'heater', { model3dKind: 'radiator' }),
    ],
  }),
  old('lighting', 'განათება', 'Lighting', 'Освещение', 'lightbulb', {
    isFurniture: false,
    children: [
      kind('pendant', 'pendant-lights', 'ჭაღები', 'Pendant lights', 'Подвесные светильники', 'lamp-ceiling'),
      kind('light_ceiling', 'ceiling-lights', 'ჭერის სანათები', 'Ceiling lights', 'Потолочные светильники', 'lightbulb'),
      kind('light_wall', 'wall-lights', 'კედლის სანათები', 'Wall lights', 'Настенные светильники', 'lamp-wall-up'),
      kind('light_spot', 'spotlights', 'წერტილოვანი სანათები', 'Spotlights', 'Точечные светильники', 'circle-dot'),
      kind('light_strip', 'led-strips', 'LED ლენტები', 'LED strips', 'LED-ленты', 'rows-2'),
      kind('light_furniture', 'furniture-lights', 'ავეჯის განათება', 'Furniture lights', 'Мебельная подсветка', 'lamp-desk'),
      kind('floor_lamp', 'floor-lamps', 'იატაკის სანათები', 'Floor lamps', 'Торшеры', 'lamp-floor'),
    ],
  }),
  old('sanitary', 'სანიტარია', 'Sanitary', 'Сантехника', 'bath', {
    isFurniture: false,
    children: [
      kind('toilet', 'toilets', 'უნიტაზები', 'Toilets', 'Унитазы', 'toilet'),
      kind('sink', 'sinks', 'ნიჟარები', 'Sinks', 'Раковины', 'sink'),
      kind('shower', 'showers', 'შხაპები', 'Showers', 'Душевые', 'shower-head'),
      kind('bathtub', 'bathtubs', 'აბაზანები', 'Bathtubs', 'Ванны', 'bath'),
      kind('washer', 'washing-machines', 'სარეცხი მანქანები', 'Washing machines', 'Стиральные машины', 'washing-machine'),
    ],
  }),
  add('furniture', 'ავეჯი', 'Furniture', 'Мебель', 'sofa', {
    isFurniture: true,
    children: [
      old('sofas', 'სავარძლები/დივნები', 'Sofas & Armchairs', 'Диваны и кресла', 'sofa', {
        children: [
          kind('sofa_3seat', 'sofas-three-seat', 'სამადგილიანი დივნები', 'Three-seat sofas', 'Трёхместные диваны', 'sofa'),
          kind('sofa_corner', 'sofas-corner', 'კუთხის დივნები', 'Corner sofas', 'Угловые диваны', 'sofa-corner'),
          kind('armchair', 'armchairs', 'სავარძლები', 'Armchairs', 'Кресла', 'armchair'),
        ],
      }),
      old('beds', 'საწოლები', 'Beds', 'Кровати', 'bed-double', {
        children: [kind('bed_double', 'beds-double', 'ორადგილიანი საწოლები', 'Double beds', 'Двуспальные кровати', 'bed-double'), kind('bed_single', 'beds-single', 'ერთადგილიანი საწოლები', 'Single beds', 'Односпальные кровати', 'bed-single')],
      }),
      old('tables', 'მაგიდები', 'Tables', 'Столы', 'coffee-table', {
        children: [
          kind('coffee_table', 'coffee-tables', 'ჟურნალის მაგიდები', 'Coffee tables', 'Журнальные столики', 'coffee-table'),
          kind('dining_table', 'dining-tables', 'სასადილო მაგიდები', 'Dining tables', 'Обеденные столы', 'utensils-crossed'),
          kind('desk', 'desks', 'სამუშაო მაგიდები', 'Desks', 'Письменные столы', 'desk'),
        ],
      }),
      old('chairs', 'სკამები', 'Chairs', 'Стулья', 'dining-chair', {
        children: [kind('dining_chair', 'dining-chairs', 'სასადილო სკამები', 'Dining chairs', 'Обеденные стулья', 'dining-chair'), kind('office_chair', 'office-chairs', 'საოფისე სკამები', 'Office chairs', 'Офисные кресла', 'office-chair')],
      }),
      old('wardrobes', 'კარადები', 'Wardrobes', 'Шкафы', 'wardrobe', { model3dKind: 'wardrobe' }),
      old('storage', 'შენახვა/თარო', 'Storage & Shelving', 'Хранение и полки', 'dresser', {
        children: [
          kind('nightstand', 'nightstands', 'ღამის მაგიდები', 'Nightstands', 'Прикроватные тумбы', 'nightstand'),
          kind('dresser', 'dressers', 'კომოდები', 'Dressers', 'Комоды', 'dresser'),
          kind('tv_unit', 'tv-units', 'ტელევიზორის თაროები', 'TV units', 'ТВ-тумбы', 'tv'),
          kind('bookshelf', 'bookshelves', 'წიგნების თაროები', 'Bookshelves', 'Книжные шкафы', 'library-big'),
          kind('storage_shelf', 'open-shelving', 'ღია სტელაჟები', 'Open shelving', 'Открытые стеллажи', 'rows-3'),
          kind('console_table', 'console-tables', 'კონსოლები', 'Console tables', 'Консоли', 'console-table'),
          kind('shoe_cabinet', 'shoe-cabinets', 'ფეხსაცმლის კარადები', 'Shoe cabinets', 'Обувницы', 'footprints'),
        ],
      }),
      old('kitchen-furniture', 'სამზარეულოს ავეჯი', 'Kitchen Furniture', 'Кухонная мебель', 'kitchen-run', {
        children: [
          kind('kitchen_run', 'kitchen-units', 'სამზარეულოს კარადები', 'Kitchen units', 'Кухонные гарнитуры', 'kitchen-run'),
          kind('kitchen_island', 'kitchen-islands', 'სამზარეულოს კუნძულები', 'Kitchen islands', 'Кухонные острова', 'kitchen-island'),
          kind('fridge', 'fridges', 'მაცივრები', 'Fridges', 'Холодильники', 'refrigerator'),
        ],
      }),
    ],
  }),
  old('decor', 'დეკორი', 'Decor', 'Декор', 'flower-2', {
    isFurniture: true,
    children: [
      kind('artwork', 'artwork', 'ნახატები', 'Artwork', 'Картины', 'image'),
      kind('plant', 'plants', 'მცენარეები', 'Plants', 'Растения', 'flower-2'),
      kind('mirror', 'mirrors', 'სარკეები', 'Mirrors', 'Зеркала', 'mirror'),
      kind('curtain', 'curtains', 'ფარდები', 'Curtains', 'Шторы', 'blinds'),
      old('rugs', 'ხალიჩები', 'Rugs', 'Ковры', 'rug', {
        children: [kind('rug', 'area-rugs', 'ოთახის ხალიჩები', 'Area rugs', 'Ковры для комнаты', 'rug'), kind('rug_bed', 'bedside-rugs', 'საწოლის ხალიჩები', 'Bedside rugs', 'Прикроватные коврики', 'rug-bedside')],
      }),
    ],
  }),
];

/** Every category of the starting tree, parents before children, in reading order. */
export const DEFAULT_CATEGORY_TREE: readonly DefaultCategory[] = (() => {
  const out: DefaultCategory[] = [];
  const walk = (list: Spec[], parent: DefaultCategory | null) => {
    list.forEach((spec, i) => {
      const { children, ...rest } = spec;
      const row: DefaultCategory = {
        ...rest,
        parent: parent?.slug ?? null,
        sortOrder: (i + 1) * 10,
        // A subcategory takes after its parent unless it says otherwise.
        isFurniture: spec.isFurniture ?? parent?.isFurniture ?? false,
        calculationType: spec.calculationType ?? parent?.calculationType ?? 'per_unit',
        inCalculator: spec.existing === true,
        model3dKind: spec.model3dKind ?? null,
        existing: spec.existing === true,
      };
      out.push(row);
      if (children) walk(children, row);
    });
  };
  walk(TREE, null);
  return out;
})();

/** The subcategory each 3D kind's products go to. */
export const DEFAULT_KIND_CATEGORY: Readonly<Record<string, string>> = Object.fromEntries(DEFAULT_CATEGORY_TREE.filter((c) => c.model3dKind).map((c) => [c.model3dKind!, c.slug]));

export interface DefaultShelfRoom {
  slug: string;
  nameKa: string;
  nameEn: string;
  nameRu: string;
  icon: string;
  roomTypes: RoomType[];
  /** The categories it lists, in order — the subcategories of the kinds that belong in the room. */
  categories: string[];
}

const ROOM_TEXT: Record<string, { slug: string; ka: string; en: string; ru: string; icon: string }> = {
  living_room: { slug: 'living-room', ka: 'მისაღები ოთახი', en: 'Living room', ru: 'Гостиная', icon: 'sofa' },
  bedroom: { slug: 'bedroom', ka: 'საძინებელი', en: 'Bedroom', ru: 'Спальня', icon: 'bed-double' },
  kitchen: { slug: 'kitchen', ka: 'სამზარეულო', en: 'Kitchen', ru: 'Кухня', icon: 'cooking-pot' },
  bathroom: { slug: 'bathroom', ka: 'სველი წერტილი', en: 'Bathroom', ru: 'Санузел', icon: 'bath' },
  toilet: { slug: 'toilet', ka: 'ტუალეტი', en: 'Toilet', ru: 'Туалет', icon: 'toilet' },
  hallway: { slug: 'hallway', ka: 'დერეფანი', en: 'Hallway', ru: 'Коридор', icon: 'door-open' },
  office: { slug: 'office', ka: 'საოფისე ოთახი', en: 'Office', ru: 'Кабинет', icon: 'briefcase-business' },
  closet: { slug: 'closet', ka: 'გარდერობი', en: 'Closet / wardrobe', ru: 'Гардеробная', icon: 'shirt' },
  balcony: { slug: 'balcony', ka: 'აივანი', en: 'Balcony', ru: 'Балкон', icon: 'sun' },
  storage: { slug: 'storage-room', ka: 'საწყობი', en: 'Storage', ru: 'Кладовая', icon: 'warehouse' },
};

/**
 * The studio's rooms as the shelf had them in code: one per room type, in the shelf's order,
 * listing the subcategories of the kinds that room's program furnishes it with.
 */
export const DEFAULT_SHELF_ROOMS: readonly DefaultShelfRoom[] = SHELF_ROOMS.map((type) => {
  const text = ROOM_TEXT[type];
  const categories = [...new Set(kindsForRoom(type).map((k) => DEFAULT_KIND_CATEGORY[k]).filter((slug): slug is string => !!slug))];
  return { slug: text.slug, nameKa: text.ka, nameEn: text.en, nameRu: text.ru, icon: text.icon, roomTypes: [type], categories };
});
