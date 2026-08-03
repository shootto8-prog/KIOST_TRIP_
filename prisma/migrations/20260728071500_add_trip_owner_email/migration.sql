-- 이메일 발송 시 매번 수신자 이메일을 다시 입력하지 않도록, 출장 등록 시점에 개인 이메일을
-- 받아 Trip에 저장해둔다(GAS 버전의 ownerEmail과 동일한 목적). 필수값은 아니고(기존 데이터
-- 보존을 위해 nullable), 신규 등록 화면에서 API 레벨로 필수 입력을 강제한다.
ALTER TABLE "Trip" ADD COLUMN "ownerEmail" TEXT;
