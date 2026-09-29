import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { MyModels } from '@/components/profile/MyModels';

/**
 * The furniture the person uploaded themselves — "ჩემი 3D ნივთები" in the sidebar of the hubs
 * and the profile (`?view=models`). Their own products (`ownerUserId`), newest first.
 */
export async function HubModels({ userId }: { userId: number }) {
  const models = await db
    .select({ id: products.id, name: products.nameKa, kind: products.model3dKind, imageUrl: products.imageUrl, status: products.model3dStatus })
    .from(products)
    .where(eq(products.ownerUserId, userId))
    .orderBy(desc(products.id));
  return <MyModels models={models} heading={false} />;
}
