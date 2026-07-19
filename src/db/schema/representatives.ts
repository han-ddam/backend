import { pgTable, uuid, text, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';
import { places } from './places';
import { certificationImages } from './certification-images';

/** (user,place) 도감 대표사진 override 핀. 없으면 최신 커버로 폴백. */
export const userPlaceRepresentative = pgTable(
  'user_place_representative',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),
    certImageId: uuid('cert_image_id').notNull().references(() => certificationImages.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.placeId] }) }),
);

/** (user,province) 지역 카드 대표사진 override 핀. 없으면 첫 등록 커버로 폴백. */
export const userRegionRepresentative = pgTable(
  'user_region_representative',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provinceCode: text('province_code').notNull(),
    certImageId: uuid('cert_image_id').notNull().references(() => certificationImages.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.provinceCode] }) }),
);
