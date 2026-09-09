/* eslint-disable no-console */
/**
 * Seeds each worker's profile: city, experience, a small portfolio of finished jobs and a
 * handful of client reviews, then recomputes `rating` / `reviewCount` from those reviews so
 * the figures on the card are the ones the reviews add up to.
 *
 *   pnpm db:seed:workers
 *
 * Idempotent: the reviews and works of the seeded workers are replaced on every run. The
 * photos are the finish textures already in `public/textures`, which is what a tiler's or a
 * plasterer's "work done" photos look like; a real partner uploads their own.
 */
import './lib/loadEnv';

import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../lib/db';
import { workerReviews, workerWorks, workers } from '../lib/db/schema';

interface Work {
  titleKa: string;
  titleEn: string;
  titleRu: string;
  descriptionKa: string;
  descriptionEn: string;
  descriptionRu: string;
  imageUrl: string;
  areaM2: number;
  city: string;
  year: number;
}

interface Review {
  authorName: string;
  rating: number;
  textKa: string;
  textEn: string;
  textRu: string;
  jobKa: string;
  jobEn: string;
  jobRu: string;
  daysAgo: number;
}

const T = (f: string) => `/textures/${f}`;

const PROFILES: Record<string, { city: string; experienceYears: number; completedJobs: number; works: Work[]; reviews: Review[] }> = {
  'გიორგი მესხი': {
    city: 'თბილისი',
    experienceYears: 12,
    completedJobs: 140,
    works: [
      { titleKa: 'აბაზანა, დიდი ფორმატის ფილა', titleEn: 'Bathroom, large-format tiles', titleRu: 'Ванная, крупноформатная плитка', descriptionKa: '60×120 კერამოგრანიტი კედლებზე და იატაკზე, ეპოქსიდური ნაკერი.', descriptionEn: '60×120 porcelain on walls and floor, epoxy grout.', descriptionRu: 'Керамогранит 60×120 на стенах и полу, эпоксидная затирка.', imageUrl: T('acg-Tiles074-diffuse.jpg'), areaM2: 24, city: 'თბილისი', year: 2026 },
      { titleKa: 'სამზარეულოს იატაკი, ტერაცო', titleEn: 'Kitchen floor, terrazzo', titleRu: 'Пол на кухне, терраццо', descriptionKa: 'ტერაცოს ფილა დიაგონალზე, თბილი იატაკის ზემოდან.', descriptionEn: 'Terrazzo tile laid diagonally over underfloor heating.', descriptionRu: 'Плитка терраццо по диагонали поверх тёплого пола.', imageUrl: T('ph-terrazzo_tiles-diffuse.jpg'), areaM2: 16, city: 'თბილისი', year: 2025 },
      { titleKa: 'აივანი, ტერაკოტა', titleEn: 'Balcony, terracotta', titleRu: 'Балкон, терракота', descriptionKa: 'ყინვაგამძლე ტერაკოტა ღია აივანზე, ქანობით წყალსადენისკენ.', descriptionEn: 'Frost-proof terracotta on an open balcony, sloped to the drain.', descriptionRu: 'Морозостойкая терракота на открытом балконе с уклоном к сливу.', imageUrl: T('ph-terracotta_floor_tiles-diffuse.jpg'), areaM2: 9, city: 'რუსთავი', year: 2025 },
      { titleKa: 'დერეფანი, მარმარილოს ეფექტი', titleEn: 'Hallway, marble effect', titleRu: 'Коридор, под мрамор', descriptionKa: 'პოლირებული კერამოგრანიტი, ნაკერი 1.5 მმ.', descriptionEn: 'Polished porcelain, 1.5 mm joints.', descriptionRu: 'Полированный керамогранит, шов 1,5 мм.', imageUrl: T('ph-marble_01-diffuse.jpg'), areaM2: 11, city: 'თბილისი', year: 2024 },
    ],
    reviews: [
      { authorName: 'ნინო კ.', rating: 5, textKa: 'აბაზანა ზუსტად ისე გამოვიდა, როგორც 3D-ში ვნახეთ. ნაკერები იდეალურია, ვადა დაიცვა.', textEn: 'The bathroom came out exactly like the 3D. Perfect joints, on time.', textRu: 'Ванная вышла точно как в 3D. Идеальные швы, в срок.', jobKa: 'აბაზანა, 8 მ²', jobEn: 'Bathroom, 8 m²', jobRu: 'Ванная, 8 м²', daysAgo: 12 },
      { authorName: 'ლაშა მ.', rating: 5, textKa: 'დიდი ფორმატის ფილა დიაგონალზე — რთული სამუშაო იყო, უნაკლოდ გააკეთა.', textEn: 'Large-format tile on the diagonal — tricky job, done flawlessly.', textRu: 'Крупный формат по диагонали — сложная работа, сделано безупречно.', jobKa: 'სამზარეულო, 16 მ²', jobEn: 'Kitchen, 16 m²', jobRu: 'Кухня, 16 м²', daysAgo: 40 },
      { authorName: 'თამარ ბ.', rating: 4, textKa: 'ხარისხი შესანიშნავია, ერთი დღით დაგვიანდა მასალის მოლოდინის გამო.', textEn: 'Excellent quality; one day late waiting on materials.', textRu: 'Отличное качество; задержка на день из-за ожидания материала.', jobKa: 'დერეფანი, 11 მ²', jobEn: 'Hallway, 11 m²', jobRu: 'Коридор, 11 м²', daysAgo: 75 },
      { authorName: 'გიგა ხ.', rating: 5, textKa: 'სუფთად მუშაობს, ყოველ საღამოს ალაგებს. რეკომენდაციას ვუწევ.', textEn: 'Clean worker, tidies up every evening. Recommended.', textRu: 'Работает чисто, каждый вечер убирает. Рекомендую.', jobKa: 'აივანი, 9 მ²', jobEn: 'Balcony, 9 m²', jobRu: 'Балкон, 9 м²', daysAgo: 120 },
      { authorName: 'ეკა დ.', rating: 5, textKa: 'ფასი წინასწარ იყო ცნობილი და არ შეცვლილა.', textEn: 'The price was known upfront and did not change.', textRu: 'Цена была известна заранее и не изменилась.', jobKa: 'სველი წერტილი, 5 მ²', jobEn: 'Wet room, 5 m²', jobRu: 'Санузел, 5 м²', daysAgo: 200 },
    ],
  },
  'დავით ბერიძე': {
    city: 'თბილისი',
    experienceYears: 9,
    completedJobs: 95,
    works: [
      { titleKa: 'მისაღები, თბილი ბათქაში', titleEn: 'Living room, warm plaster', titleRu: 'Гостиная, тёплая штукатурка', descriptionKa: 'ორი ფენა ფინიშური ბათქაში, მატი საღებავი ორ ფენად.', descriptionEn: 'Two coats of finishing plaster, two coats of matte paint.', descriptionRu: 'Два слоя финишной штукатурки, два слоя матовой краски.', imageUrl: T('plaster-warm.jpg'), areaM2: 62, city: 'თბილისი', year: 2026 },
      { titleKa: 'საძინებელი, ვინტაჟური ტექსტურა', titleEn: 'Bedroom, vintage texture', titleRu: 'Спальня, винтажная фактура', descriptionKa: 'დეკორატიული ბათქაში ხელით, ცვილის დაფარვით.', descriptionEn: 'Hand-applied decorative plaster with a wax finish.', descriptionRu: 'Декоративная штукатурка вручную, покрытие воском.', imageUrl: T('plaster-vintage.jpg'), areaM2: 38, city: 'თბილისი', year: 2025 },
      { titleKa: 'ოფისი, შეღებილი ბათქაში', titleEn: 'Office, painted plaster', titleRu: 'Офис, окрашенная штукатурка', descriptionKa: '180 მ² კედელი ორ კვირაში, ბზარების გარეშე.', descriptionEn: '180 m² of wall in two weeks, no cracks.', descriptionRu: '180 м² стен за две недели, без трещин.', imageUrl: T('acg-PaintedPlaster017-diffuse.jpg'), areaM2: 180, city: 'ბათუმი', year: 2024 },
    ],
    reviews: [
      { authorName: 'მარიამ გ.', rating: 5, textKa: 'კედლები სარკესავით სწორია. საღებავიც თავად შეარჩია სტილის მიხედვით.', textEn: 'Walls as straight as a mirror. Picked the paint to match the style himself.', textRu: 'Стены ровные как зеркало. Сам подобрал краску под стиль.', jobKa: 'მისაღები, 62 მ²', jobEn: 'Living room, 62 m²', jobRu: 'Гостиная, 62 м²', daysAgo: 20 },
      { authorName: 'ირაკლი ჩ.', rating: 5, textKa: 'დეკორატიული ბათქაში პირველად გავაკეთეთ — შედეგი ფოტოზე უკეთესია.', textEn: 'First time we did decorative plaster — the result beats the photos.', textRu: 'Впервые сделали декоративную штукатурку — результат лучше фото.', jobKa: 'საძინებელი, 38 მ²', jobEn: 'Bedroom, 38 m²', jobRu: 'Спальня, 38 м²', daysAgo: 66 },
      { authorName: 'ანა წ.', rating: 4, textKa: 'კარგი მუშაობა, ცოტა ხმაურიანი პროცესი იყო.', textEn: 'Good work; the process was a bit noisy.', textRu: 'Хорошая работа, процесс был немного шумным.', jobKa: 'ოფისი, 180 მ²', jobEn: 'Office, 180 m²', jobRu: 'Офис, 180 м²', daysAgo: 150 },
      { authorName: 'ზაზა რ.', rating: 5, textKa: 'დროულად, სუფთად, შეთანხმებულ ფასად.', textEn: 'On time, clean, at the agreed price.', textRu: 'Вовремя, чисто, по договорённой цене.', jobKa: 'დერეფანი, 20 მ²', jobEn: 'Hallway, 20 m²', jobRu: 'Коридор, 20 м²', daysAgo: 240 },
    ],
  },
  'ლევან წერეთელი': {
    city: 'თბილისი',
    experienceYears: 15,
    completedJobs: 210,
    works: [
      { titleKa: 'აბაზანა, სრული სანტექნიკა', titleEn: 'Bathroom, full plumbing', titleRu: 'Ванная, полная сантехника', descriptionKa: 'წყლის და კანალიზაციის ახალი გაყვანილობა, დამალული ინსტალაცია.', descriptionEn: 'New water and drain lines, concealed cistern.', descriptionRu: 'Новая разводка воды и канализации, скрытая инсталляция.', imageUrl: T('acg-Tiles036-diffuse.jpg'), areaM2: 6, city: 'თბილისი', year: 2026 },
      { titleKa: 'სამზარეულო, წყალგაყვანილობა', titleEn: 'Kitchen plumbing', titleRu: 'Сантехника кухни', descriptionKa: 'ნიჟარა, ჭურჭლის სარეცხი, ფილტრი — ერთ დღეში.', descriptionEn: 'Sink, dishwasher, filter — in a day.', descriptionRu: 'Мойка, посудомойка, фильтр — за день.', imageUrl: T('ph-interior_tiles-diffuse.jpg'), areaM2: 12, city: 'თბილისი', year: 2025 },
      { titleKa: 'თბილი იატაკი, კოლექტორი', titleEn: 'Underfloor heating manifold', titleRu: 'Тёплый пол, коллектор', descriptionKa: 'წყლის თბილი იატაკი სამ ოთახში, კოლექტორი და ავტომატიკა.', descriptionEn: 'Hydronic underfloor heating in three rooms, manifold and controls.', descriptionRu: 'Водяной тёплый пол в трёх комнатах, коллектор и автоматика.', imageUrl: T('acg-Concrete034-diffuse.jpg'), areaM2: 48, city: 'თბილისი', year: 2024 },
    ],
    reviews: [
      { authorName: 'სოფო ა.', rating: 5, textKa: 'დამალული ინსტალაცია სუფთად ჩასვა, არც ერთი წვეთი არ გაჟონა.', textEn: 'Fitted the concealed cistern cleanly, not a single leak.', textRu: 'Скрытую инсталляцию поставил чисто, ни одной протечки.', jobKa: 'აბაზანა, 6 მ²', jobEn: 'Bathroom, 6 m²', jobRu: 'Ванная, 6 м²', daysAgo: 8 },
      { authorName: 'ბექა ლ.', rating: 5, textKa: 'თბილი იატაკი ზამთარშიც შესანიშნავად მუშაობს.', textEn: 'The underfloor heating works perfectly, even in winter.', textRu: 'Тёплый пол отлично работает даже зимой.', jobKa: 'თბილი იატაკი, 48 მ²', jobEn: 'Underfloor heating, 48 m²', jobRu: 'Тёплый пол, 48 м²', daysAgo: 95 },
      { authorName: 'ნათია პ.', rating: 5, textKa: 'ერთ დღეში მოაგვარა ის, რაც სხვებმა კვირა გადადეს.', textEn: 'Solved in a day what others had put off for a week.', textRu: 'За день решил то, что другие откладывали неделю.', jobKa: 'სამზარეულო', jobEn: 'Kitchen', jobRu: 'Кухня', daysAgo: 160 },
      { authorName: 'გურამ ს.', rating: 5, textKa: 'პროფესიონალი. ფასიც სამართლიანია.', textEn: 'A professional. Fair price too.', textRu: 'Профессионал. И цена справедливая.', jobKa: 'ტუალეტი, 3 მ²', jobEn: 'Toilet, 3 m²', jobRu: 'Туалет, 3 м²', daysAgo: 300 },
    ],
  },
  'ნიკა ჯავახიშვილი': {
    city: 'თბილისი',
    experienceYears: 8,
    completedJobs: 120,
    works: [
      { titleKa: 'ბინა, სრული ელექტროგაყვანილობა', titleEn: 'Flat, full rewiring', titleRu: 'Квартира, полная электропроводка', descriptionKa: '86 მ² ბინა: 42 როზეტი, 3 ავტომატის ფარი, LED განათება.', descriptionEn: '86 m² flat: 42 sockets, three-panel distribution board, LED lighting.', descriptionRu: 'Квартира 86 м²: 42 розетки, щит на три автомата, LED-освещение.', imageUrl: T('acg-Plaster002-diffuse.jpg'), areaM2: 86, city: 'თბილისი', year: 2026 },
      { titleKa: 'სამზარეულო, ჩაშენებული განათება', titleEn: 'Kitchen, built-in lighting', titleRu: 'Кухня, встроенное освещение', descriptionKa: 'ლენტური განათება კარადებქვეშ, დიმერები.', descriptionEn: 'Under-cabinet strips, dimmers.', descriptionRu: 'Ленты под шкафами, диммеры.', imageUrl: T('wood-floor-light-diffuse.jpg'), areaM2: 14, city: 'თბილისი', year: 2025 },
      { titleKa: 'ოფისი, ქსელი და ელექტროობა', titleEn: 'Office, network and power', titleRu: 'Офис, сеть и электрика', descriptionKa: '24 სამუშაო ადგილი, კაბელ-არხები, ქსელის კარადა.', descriptionEn: '24 desks, cable trunking, network cabinet.', descriptionRu: '24 рабочих места, кабель-каналы, сетевой шкаф.', imageUrl: T('concrete.jpg'), areaM2: 140, city: 'ბათუმი', year: 2024 },
    ],
    reviews: [
      { authorName: 'ლუკა თ.', rating: 5, textKa: 'ფარი ისეა დალაგებული, რომ სიამოვნებაა ყურება. ყველა ხაზი დანიშნულია.', textEn: 'The board is a pleasure to look at. Every circuit labelled.', textRu: 'Щит собран так, что приятно смотреть. Каждая линия подписана.', jobKa: 'ბინა, 86 მ²', jobEn: 'Flat, 86 m²', jobRu: 'Квартира, 86 м²', daysAgo: 15 },
      { authorName: 'ქეთი ვ.', rating: 5, textKa: 'დიმერები და ლენტები — სამზარეულო სულ სხვანაირად გამოიყურება.', textEn: 'Dimmers and strips — the kitchen looks completely different.', textRu: 'Диммеры и ленты — кухня выглядит совершенно иначе.', jobKa: 'სამზარეულო', jobEn: 'Kitchen', jobRu: 'Кухня', daysAgo: 70 },
      { authorName: 'დათო ქ.', rating: 4, textKa: 'კარგად გააკეთა, ერთი როზეტი მოგვიანებით გადაიტანა უფასოდ.', textEn: 'Good job; moved one socket later for free.', textRu: 'Сделал хорошо, одну розетку позже перенёс бесплатно.', jobKa: 'საძინებელი', jobEn: 'Bedroom', jobRu: 'Спальня', daysAgo: 130 },
      { authorName: 'მაია ო.', rating: 5, textKa: 'ოფისი ორ დღეში, ხმაურის და ჭუჭყის გარეშე.', textEn: 'Office done in two days, no noise, no mess.', textRu: 'Офис за два дня, без шума и грязи.', jobKa: 'ოფისი, 140 მ²', jobEn: 'Office, 140 m²', jobRu: 'Офис, 140 м²', daysAgo: 260 },
    ],
  },
  'რევაზ კობახიძე': {
    city: 'ქუთაისი',
    experienceYears: 20,
    completedJobs: 75,
    works: [
      { titleKa: 'მუხის პარკეტი, ქერქის ნახატი', titleEn: 'Oak parquet, herringbone', titleRu: 'Дубовый паркет, ёлочка', descriptionKa: 'მასიური მუხა, ზეთით დაფარვა, ხელით მორგებული პლინტუსი.', descriptionEn: 'Solid oak, oiled, hand-fitted skirting.', descriptionRu: 'Массив дуба, масло, плинтус подогнан вручную.', imageUrl: T('ph-herringbone_parquet-diffuse.jpg'), areaM2: 34, city: 'ქუთაისი', year: 2026 },
      { titleKa: 'შიდა კარები, 6 ცალი', titleEn: 'Interior doors, six', titleRu: 'Межкомнатные двери, 6 шт.', descriptionKa: 'მასიური კარები ჩარჩოებით, ფარული ანჯამები.', descriptionEn: 'Solid doors with frames, concealed hinges.', descriptionRu: 'Двери из массива с коробками, скрытые петли.', imageUrl: T('wood-floor-warm-diffuse.jpg'), areaM2: 12, city: 'ქუთაისი', year: 2025 },
      { titleKa: 'კარადა ნიშაში', titleEn: 'Built-in wardrobe', titleRu: 'Шкаф в нише', descriptionKa: 'ჭერამდე კარადა, გასაწევი კარები, შიდა განათება.', descriptionEn: 'Floor-to-ceiling wardrobe, sliding doors, interior lighting.', descriptionRu: 'Шкаф до потолка, раздвижные двери, внутренняя подсветка.', imageUrl: T('wood-floor-grey-diffuse.jpg'), areaM2: 4, city: 'თბილისი', year: 2024 },
    ],
    reviews: [
      { authorName: 'ნიკოლოზ ა.', rating: 5, textKa: 'პარკეტი ერთ დღეშიც არ დაიჭრიალა. ნამდვილი ოსტატია.', textEn: 'The parquet has not creaked once. A true craftsman.', textRu: 'Паркет ни разу не скрипнул. Настоящий мастер.', jobKa: 'პარკეტი, 34 მ²', jobEn: 'Parquet, 34 m²', jobRu: 'Паркет, 34 м²', daysAgo: 25 },
      { authorName: 'თეა მ.', rating: 5, textKa: 'კარადა მილიმეტრზე ჩაჯდა ნიშაში.', textEn: 'The wardrobe fits the niche to the millimetre.', textRu: 'Шкаф встал в нишу с точностью до миллиметра.', jobKa: 'კარადა', jobEn: 'Wardrobe', jobRu: 'Шкаф', daysAgo: 110 },
      { authorName: 'ალექსანდრე გ.', rating: 4, textKa: 'შესანიშნავი ხარისხი, ვადა ორი კვირით გაიწელა.', textEn: 'Excellent quality, but two weeks over the deadline.', textRu: 'Отличное качество, но срок сдвинулся на две недели.', jobKa: 'კარები, 6 ცალი', jobEn: 'Doors, six', jobRu: 'Двери, 6 шт.', daysAgo: 220 },
    ],
  },
  'ზურაბ კვარაცხელია': {
    city: 'ბათუმი',
    experienceYears: 11,
    completedJobs: 110,
    works: [
      { titleKa: 'ბინა, კედლების გასწორება', titleEn: 'Flat, wall levelling', titleRu: 'Квартира, выравнивание стен', descriptionKa: 'შავი კარკასიდან — შუქურებზე ბათქაში, 240 მ² კედელი.', descriptionEn: 'From bare shell — plaster on beads, 240 m² of wall.', descriptionRu: 'От чёрного каркаса — штукатурка по маякам, 240 м² стен.', imageUrl: T('ph-plaster_grey_04-diffuse.jpg'), areaM2: 240, city: 'ბათუმი', year: 2026 },
      { titleKa: 'ფასადი, დეკორატიული ბათქაში', titleEn: 'Facade, decorative render', titleRu: 'Фасад, декоративная штукатурка', descriptionKa: 'სილიკონური ბათქაში ფასადზე, 2 ფერი.', descriptionEn: 'Silicone render on the facade, two colours.', descriptionRu: 'Силиконовая штукатурка на фасаде, два цвета.', imageUrl: T('acg-PaintedPlaster017-diffuse.jpg'), areaM2: 95, city: 'ბათუმი', year: 2025 },
      { titleKa: 'აგურის კედელი, ლოფტი', titleEn: 'Brick wall, loft', titleRu: 'Кирпичная стена, лофт', descriptionKa: 'აგურის გაწმენდა და დაცვა ლაქით — ინდუსტრიული სტილი.', descriptionEn: 'Brick cleaned and sealed — industrial style.', descriptionRu: 'Кирпич очищен и покрыт лаком — индустриальный стиль.', imageUrl: T('brick-05-diffuse.jpg'), areaM2: 28, city: 'ბათუმი', year: 2024 },
    ],
    reviews: [
      { authorName: 'ხატია ს.', rating: 5, textKa: 'შავი კარკასიდან ერთ თვეში სუფთა კედლები გვქონდა.', textEn: 'From bare shell to clean walls in a month.', textRu: 'От чёрного каркаса до ровных стен за месяц.', jobKa: 'ბინა, 240 მ²', jobEn: 'Flat, 240 m²', jobRu: 'Квартира, 240 м²', daysAgo: 30 },
      { authorName: 'ომარ ბ.', rating: 5, textKa: 'აგურის კედელი ისე გაწმინდა, ლოფტი გამოვიდა.', textEn: 'Cleaned the brick wall so well it turned into a loft.', textRu: 'Так очистил кирпичную стену, что получился лофт.', jobKa: 'ლოფტი, 28 მ²', jobEn: 'Loft, 28 m²', jobRu: 'Лофт, 28 м²', daysAgo: 140 },
      { authorName: 'ლია ჯ.', rating: 4, textKa: 'კარგი ბათქაში, ფასი საშუალოზე ცოტა მაღალი.', textEn: 'Good plastering; price a little above average.', textRu: 'Хорошая штукатурка; цена чуть выше средней.', jobKa: 'ფასადი, 95 მ²', jobEn: 'Facade, 95 m²', jobRu: 'Фасад, 95 м²', daysAgo: 280 },
    ],
  },
};

async function main() {
  const rows = await db.select({ id: workers.id, nameKa: workers.nameKa }).from(workers);
  const seeded = rows.filter((r) => PROFILES[r.nameKa]);
  if (seeded.length === 0) {
    console.log('no seeded workers found — run pnpm db:seed first');
    return;
  }
  // `workers` has no unique key, so an earlier double seed can leave two rows with one name;
  // keep the first and retire the rest rather than showing the same person twice.
  const seen = new Set<string>();
  const extras = seeded.filter((r) => (seen.has(r.nameKa) ? true : (seen.add(r.nameKa), false)));
  if (extras.length) {
    await db.update(workers).set({ isActive: false }).where(inArray(workers.id, extras.map((r) => r.id)));
    console.log(`— retired ${extras.length} duplicate worker row(s)`);
  }
  const unique = seeded.filter((r) => !extras.includes(r));
  const ids = unique.map((r) => r.id);
  await db.delete(workerReviews).where(inArray(workerReviews.workerId, ids));
  await db.delete(workerWorks).where(inArray(workerWorks.workerId, ids));

  const now = Date.now();
  for (const row of unique) {
    const profile = PROFILES[row.nameKa];
    await db.insert(workerWorks).values(
      profile.works.map((w, i) => ({
        workerId: row.id,
        titleKa: w.titleKa,
        titleEn: w.titleEn,
        titleRu: w.titleRu,
        descriptionKa: w.descriptionKa,
        descriptionEn: w.descriptionEn,
        descriptionRu: w.descriptionRu,
        imageUrl: w.imageUrl,
        areaM2: String(w.areaM2),
        city: w.city,
        year: w.year,
        sortOrder: i,
      }))
    );
    await db.insert(workerReviews).values(
      profile.reviews.map((r) => ({
        workerId: row.id,
        authorName: r.authorName,
        rating: r.rating,
        textKa: r.textKa,
        textEn: r.textEn,
        textRu: r.textRu,
        jobKa: r.jobKa,
        jobEn: r.jobEn,
        jobRu: r.jobRu,
        createdAt: new Date(now - r.daysAgo * 86_400_000),
      }))
    );
    const avg = profile.reviews.reduce((s, r) => s + r.rating, 0) / profile.reviews.length;
    await db
      .update(workers)
      .set({
        city: profile.city,
        experienceYears: profile.experienceYears,
        completedJobs: profile.completedJobs,
        rating: avg.toFixed(2),
        reviewCount: profile.reviews.length,
      })
      .where(eq(workers.id, row.id));
    console.log(`— ${row.nameKa}: ${profile.works.length} works, ${profile.reviews.length} reviews, rating ${avg.toFixed(2)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
