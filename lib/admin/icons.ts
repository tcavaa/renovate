/**
 * Category icons: lucide icons, stored by the kebab name lucide.dev shows ('door-open').
 *
 * The admin picks one in `IconPicker` rather than typing it, so the name only has to find its
 * icon again: `iconLookupKey` reduces every way of writing it — 'door-open', 'DoorOpen',
 * 'door open' — to one key, and lucide's own names never collide on it.
 *
 * `SUGGESTED_ICONS` are the ones a renovation catalogue needs, grouped, each with the words an
 * admin would search for in Georgian, Russian and English (lucide's names are English only);
 * the first group is the studio's own furniture icons (`STUDIO_ICONS`), which lucide has not.
 */

/**
 * An icon as lucide draws it: its SVG elements, each a tag and its attributes, on a 24 × 24
 * stroked canvas. What the server sends where the whole icon set would be too much to ship
 * (the studio's shelf), and what the studio's own furniture icons are written as.
 */
export type IconNode = Array<[string, Record<string, string>]>;

const path = (d: string, key: string): [string, Record<string, string>] => ['path', { d, key }];
const rect = (x: number, y: number, width: number, height: number, key: string, rx = 1): [string, Record<string, string>] => ['rect', { x: String(x), y: String(y), width: String(width), height: String(height), rx: String(rx), key }];
const circle = (cx: number, cy: number, r: number, key: string): [string, Record<string, string>] => ['circle', { cx: String(cx), cy: String(cy), r: String(r), key }];

/**
 * The furniture lucide lacks — its `Table` icons are spreadsheet grids and it has one sofa —
 * drawn in its idiom (24 × 24, stroked) for the studio's shelf, so the two sofas or the two
 * beds can be told apart at a glance. They are icons like lucide's for everything that takes
 * one (a category, a studio room): the picker lists them first, by these names, which no
 * lucide icon has.
 */
export const STUDIO_ICONS: Readonly<Record<string, IconNode>> = {
  /** An L seen from above: the back runs along the top and down the left. */
  'sofa-corner': [path('M3 4h18v9h-8v7H3z', 'body'), path('M7 8h10', 'back'), path('M7 8v8', 'side')],
  nightstand: [rect(6, 11, 12, 8, 'body'), path('M6 15h12', 'drawer'), path('M11 13h2', 'knob'), path('M8 19v2M16 19v2', 'legs'), path('M12 11V8', 'stem'), path('M9 8h6l-1.5-4h-3z', 'shade')],
  wardrobe: [rect(5, 3, 14, 17, 'body'), path('M12 3v17', 'doors'), path('M10 11v2M14 11v2', 'handles'), path('M7 20v1.5M17 20v1.5', 'legs')],
  dresser: [rect(4, 5, 16, 14, 'body'), path('M4 9.7h16M4 14.3h16', 'drawers'), path('M11 7.4h2M11 12h2M11 16.6h2', 'knobs'), path('M6 19v2M18 19v2', 'legs')],
  'coffee-table': [path('M3 10h18', 'top'), path('M6 10v7M18 10v7', 'legs'), path('M6 14h12', 'shelf')],
  'console-table': [path('M4 6h16v3H4z', 'top'), path('M6 9v12M18 9v12', 'legs'), path('M11 7.5h2', 'knob')],
  'dining-chair': [path('M7 3v18', 'back'), path('M7 7h4M7 10h4', 'slats'), path('M7 13h10', 'seat'), path('M17 13v8', 'leg')],
  desk: [path('M3 7h18', 'top'), path('M5 7v13M19 7v13', 'legs'), rect(12, 7, 7, 8, 'drawers', 0.5), path('M12 11h7', 'split'), path('M15 9h1M15 13h1', 'knobs')],
  'office-chair': [rect(8, 3, 8, 8, 'back', 2), path('M6 14h12', 'seat'), path('M12 14v4', 'post'), path('M7 21l5-3 5 3', 'base'), path('M6 14v-2M18 14v-2', 'arms')],
  'kitchen-run': [path('M3 8h18', 'worktop'), rect(4, 8, 16, 12, 'body', 0.5), path('M12 8v12', 'doors'), path('M10 12v2M14 12v2', 'handles'), path('M7 8V5h3', 'tap')],
  'kitchen-island': [rect(3, 6, 18, 7, 'top', 1), path('M6 13v2M18 13v2', 'body'), circle(8, 19, 1.6, 'stool-a'), circle(16, 19, 1.6, 'stool-b')],
  sink: [path('M4 11h16v1a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z', 'basin'), path('M12 11V6a2 2 0 0 1 2-2h1', 'tap'), path('M12 18v3', 'pedestal')],
  mirror: [['ellipse', { cx: '12', cy: '10', rx: '6', ry: '7.5', key: 'glass' }], path('M12 17.5V21', 'stand'), path('M8.5 21h7', 'foot'), path('M10 6.5l-1.5 2.5', 'shine')],
  rug: [rect(5, 6, 14, 12, 'rug'), path('M5 9H3M5 12H3M5 15H3', 'fringe-a'), path('M19 9h2M19 12h2M19 15h2', 'fringe-b'), rect(8.5, 9.5, 7, 5, 'border', 0.5)],
  'rug-bedside': [rect(5, 9, 14, 6, 'rug'), path('M5 11H3M5 13H3', 'fringe-a'), path('M19 11h2M19 13h2', 'fringe-b')],
};

/** One key for every spelling of a lucide name: lower case, no dashes, spaces or underscores. */
export function iconLookupKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * The kebab name for lucide's PascalCase export: 'DoorOpen' → 'door-open', 'Grid3x3' →
 * 'grid-3x3'. A handful of lucide's names hyphenate their digits differently ('arrow-down-0-1');
 * those still find their icon through `iconLookupKey`.
 */
export function iconKebabName(pascal: string): string {
  return pascal
    .replace(/(\d)x(\d)/g, '$1\u0000$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z])([A-Z0-9])/g, '$1-$2')
    .replace(/(\d)([A-Z])/g, '$1-$2')
    .replace(/\u0000/g, 'x')
    .toLowerCase();
}

/** Whether an icon answers a search: every word of it found in the name or its search words. */
export function iconMatches(name: string, query: string, words = ''): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = `${name.replace(/-/g, ' ')} ${name} ${words}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export const ICON_GROUPS = ['studio', 'finishes', 'openings', 'electrical', 'heating', 'plumbing', 'kitchen', 'furniture', 'decor', 'work'] as const;
export type IconGroup = (typeof ICON_GROUPS)[number];

export interface IconSuggestion {
  name: string;
  group: IconGroup;
  /** What an admin might type for it, in Georgian, Russian and English. */
  words: string;
}

const suggest = (group: IconGroup, entries: Record<string, string>): IconSuggestion[] =>
  Object.entries(entries).map(([name, words]) => ({ name, group, words }));

export const SUGGESTED_ICONS: readonly IconSuggestion[] = [
  ...suggest('studio', {
    'sofa-corner': 'კუთხის დივანი угловой диван corner sofa',
    nightstand: 'ღამის მაგიდა ტუმბო тумба прикроватная nightstand bedside',
    wardrobe: 'კარადა გარდერობი шкаф гардероб wardrobe',
    dresser: 'კომოდი комод dresser drawers',
    'coffee-table': 'ჟურნალის მაგიდა журнальный столик coffee table',
    'console-table': 'კონსოლი консоль console table',
    'dining-chair': 'სასადილო სკამი стул обеденный dining chair',
    desk: 'სამუშაო მაგიდა письменный стол desk',
    'office-chair': 'საოფისე სკამი офисное кресло office chair',
    'kitchen-run': 'სამზარეულოს კარადა гарнитур кухня kitchen units',
    'kitchen-island': 'სამზარეულოს კუნძული кухонный остров kitchen island',
    sink: 'ნიჟარა ხელსაბანი раковина sink basin',
    mirror: 'სარკე зеркало mirror',
    rug: 'ხალიჩა ковёр rug carpet',
    'rug-bedside': 'საწოლის ხალიჩა прикроватный коврик bedside rug',
  }),
  ...suggest('finishes', {
    'grid-3x3': 'ფილა კაფელი მეტლახი плитка кафель tile tiles',
    'grid-2x2': 'ფილა კაფელი плитка tile',
    'layout-grid': 'ფილა მოზაიკა плитка мозаика tile mosaic',
    'brick-wall': 'კედელი აგური стена кирпич wall brick',
    layers: 'ფენა ლამინატი იატაკი ламинат пол слои laminate floor layers',
    'rows-3': 'ლამინატი პარკეტი დაფა паркет ламинат доска parquet planks',
    square: 'იატაკი ფილა пол квадрат floor square',
    minus: 'პლინტუსი ზოლი плинтус skirting',
    frame: 'კარნიზი ჩარჩო карниз рама cornice frame moulding',
    'paint-roller': 'საღებავი ღებვა краска покраска paint roller',
    paintbrush: 'ფუნჯი საღებავი кисть краска brush paint',
    'paint-bucket': 'საღებავი ვედრო краска ведро paint bucket',
    palette: 'ფერი ფერები цвет палитра colour color palette',
    wallpaper: 'შპალერი обои wallpaper',
    'spray-can': 'სპრეი ლაქი спрей лак spray varnish',
  }),
  ...suggest('openings', {
    'door-open': 'კარი კარები дверь двери door',
    'door-closed': 'კარი შესასვლელი дверь входная door entrance',
    'app-window': 'ფანჯარა окно window',
    'columns-2': 'ფანჯარა ორფრთიანი окно створки window',
    blinds: 'ჟალუზი ფარდა жалюзи шторы blinds curtains',
    fence: 'ღობე მოაჯირი забор перила fence railing',
  }),
  ...suggest('electrical', {
    plug: 'როზეტი შტეფსელი розетка вилка socket plug',
    'plug-zap': 'როზეტი დენი розетка ток socket power',
    power: 'ამომრთველი ჩამრთველი выключатель switch power',
    'toggle-left': 'ამომრთველი выключатель switch',
    zap: 'ელექტროობა დენი электрика ток electric',
    cable: 'კაბელი სადენი кабель провод cable wire',
    lightbulb: 'ნათურა განათება лампочка свет bulb light',
    'lamp-ceiling': 'ჭაღი ჭერის სანათი люстра потолок ceiling lamp chandelier',
    lamp: 'ლამპა სანათი лампа lamp',
    'lamp-floor': 'ტორშერი торшер floor lamp',
    'lamp-desk': 'მაგიდის ლამპა настольная лампа desk lamp',
    'lamp-wall-up': 'კედლის სანათი ბრა бра настенный wall lamp sconce',
    sun: 'განათება მზე свет солнце light sun',
  }),
  ...suggest('heating', {
    flame: 'გათბობა ცეცხლი ქვაბი отопление огонь котёл heating flame boiler',
    heater: 'რადიატორი გამათბობელი радиатор обогреватель radiator heater',
    thermometer: 'ტემპერატურა თერმომეტრი температура термометр thermometer',
    'air-vent': 'კონდიციონერი ვენტილაცია кондиционер вентиляция air conditioner vent',
    fan: 'ვენტილატორი вентилятор fan',
    snowflake: 'გაგრილება კონდიციონერი охлаждение кондиционер cooling',
    wind: 'ჰაერი ვენტილაცია воздух вентиляция air ventilation',
  }),
  ...suggest('plumbing', {
    bath: 'აბაზანა ვანა სააბაზანო ванна ванная bath bathtub',
    'shower-head': 'შხაპი душ shower',
    toilet: 'უნიტაზი საპირფარეშო унитаз туалет toilet wc',
    droplet: 'წყალი სანტექნიკა сантехника вода water plumbing',
    droplets: 'წყალი ონკანი вода кран water tap',
    waves: 'წყალი აუზი вода бассейн water pool',
    'washing-machine': 'სარეცხი მანქანა стиральная машина washing machine',
    wrench: 'სანტექნიკა ქანჩი сантехника ключ plumbing wrench',
  }),
  ...suggest('kitchen', {
    'cooking-pot': 'სამზარეულო ქვაბი кухня кастрюля kitchen pot',
    utensils: 'სამზარეულო ჭურჭელი кухня посуда kitchen cutlery',
    refrigerator: 'მაცივარი холодильник fridge refrigerator',
    microwave: 'მიკროტალღური ღუმელი микроволновка печь microwave oven',
    'chef-hat': 'სამზარეულო მზარეული кухня повар kitchen chef',
  }),
  ...suggest('furniture', {
    'bed-double': 'საწოლი ორადგილიანი кровать двуспальная bed double',
    'bed-single': 'საწოლი ერთადგილიანი кровать односпальная bed single',
    bed: 'საწოლი საძინებელი кровать спальня bed bedroom',
    sofa: 'დივანი диван sofa couch',
    armchair: 'სავარძელი кресло armchair chair',
    table: 'მაგიდა стол table',
    'table-2': 'მაგიდა სასადილო стол обеденный table dining',
    archive: 'კარადა კომოდი შენახვა комод шкаф хранение wardrobe drawers storage',
    library: 'თარო წიგნები полка книги shelf shelving books',
    package: 'ყუთი შენახვა коробка хранение box storage',
    baby: 'საბავშვო ბავშვი детская ребёнок kids nursery',
    tv: 'ტელევიზორი ტვ телевизор тв tv television',
    monitor: 'კომპიუტერი სამუშაო компьютер рабочее monitor desk office',
  }),
  ...suggest('decor', {
    image: 'სურათი დეკორი картина декор picture decor',
    'flower-2': 'ყვავილი მცენარე цветок растение flower plant',
    sprout: 'მცენარე ქოთანი растение горшок plant pot',
    leaf: 'ფოთოლი მცენარე лист растение leaf plant',
    clock: 'საათი часы clock',
    sparkles: 'დეკორი ახალი декор новинка decor new',
    star: 'საუკეთესო ვარსკვლავი лучшее звезда best star',
  }),
  ...suggest('work', {
    hammer: 'ჩაქუჩი რემონტი молоток ремонт hammer renovation',
    drill: 'დრელი ბურღი дрель drill',
    ruler: 'სახაზავი გაზომვა линейка замер ruler measure',
    construction: 'მშენებლობა სამშენებლო стройка строительство construction',
    'hard-hat': 'ჩაფხუტი ბრიგადა каска бригада hard hat crew',
    shovel: 'ნიჩაბი ბეტონი лопата бетон shovel concrete',
    boxes: 'მასალა მასალები ყუთები материалы коробки materials boxes',
    truck: 'მიწოდება სატვირთო доставка грузовик delivery truck',
    house: 'სახლი ბინა дом квартира house home flat',
    'building-2': 'შენობა ბინა здание квартира building apartment',
    store: 'მაღაზია магазин store shop',
    tag: 'ფასი ფასდაკლება цена скидка price tag sale',
  }),
];
