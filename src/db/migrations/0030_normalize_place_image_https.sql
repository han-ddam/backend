-- TourAPI(firstimage) 핫링크가 http로 저장돼 https 프론트에서 mixed-content로 차단됨.
-- tong.visitkorea.or.kr 은 https를 정상 지원하므로 해당 호스트만 스킴 승격.
-- (place는 사용자 확장 예정 — 다른 호스트 이미지는 건드리지 않도록 호스트 스코프로 한정)
UPDATE "place"
SET "image_url" = replace("image_url", 'http://tong.visitkorea.or.kr', 'https://tong.visitkorea.or.kr')
WHERE "image_url" LIKE 'http://tong.visitkorea.or.kr%';
