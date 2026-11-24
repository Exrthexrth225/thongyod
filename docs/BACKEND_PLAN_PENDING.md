# แผน backend: รอเราตอบ

สถานะ: **ข้อเสนอเพื่อให้ Earth ตัดสินใจ ไม่ใช่กติกาที่อนุมัติแล้ว** — 2026-11-24
เป้าหมาย: นัดเจอ หารเงิน เล่นด้วยกัน; Home และโหมดตอบทีละรายการใช้ข้อมูลชุดเดียวกัน
PR นี้มีเพียงเอกสาร ไม่แก้ application code, shared types, ERD, schema, migration หรือ mocks

## 1. ฐานเดิมและ data model ที่เสนอ

อ่าน `HANDOFF.md`, `DECISIONS.md` (ล่าสุด #131), `ERD.md` และ social module แล้ว:
- ใช้ `USERS`, `GANGS`, ประวัติ `GANG_MEMBERS` และ `MEETUPS` เดิม; ไม่มีเจ้าของแก๊ง (#31)
- ERD บางส่วนยังเป็นข้อเสนอ: DB จริงใช้ `meetup_responses` และ `app_notifications`; ไม่สมมติว่าตาราง attendance/guests ใน ERD ทำแล้ว
- `ActivityService.home()` คืน `pending: []`; ข้อความตัวอย่างใน `mocks/db.ts` ยังไม่ใช่บิล/โหวตที่ตอบได้
- #23 เก็บเงินเป็นจำนวนเต็มสตางค์; #53 และ `features/bill-split/bill.ts` รองรับหลายคนออกเงิน, คนละรายการ, เลี้ยง และปัด **ขึ้นต่อรายการโอน** เป็นบาทเต็ม; ไม่มี VAT/service charge หรือหารน้ำหนัก
- #14 และ `restaurant-vote/logic.ts`: เลือกได้หลายร้าน, ไม่เผยว่าใครเลือกอะไร; ในเครื่องสุ่มจากร้านที่ผู้โหวตทุกคนยอมรับ หากไม่มีร้านร่วมให้กลุ่มตัดสินต่อ

ตารางด้านล่างเป็นแบบจำลอง ไม่ใช่ DDL; PK เป็น UUID, วันเวลาเป็น timestamptz/UTC และตรวจยอดด้วย integer เท่านั้น

| Entity ใหม่ | ข้อมูลหลักและความสัมพันธ์ |
|---|---|
| `BILLS` | `gang_id → GANGS`, `meetup_id → MEETUPS` nullable, `created_by → USERS`, title, draft/open/closed/cancelled, current_revision, created_at; ถ้าผูกนัดต้องเป็นแก๊งเดียวกัน |
| `BILL_REVISIONS` | `(bill_id, revision)` unique, mode equal/by_item, default merchant-payer, total_satang, algorithm_version, published_at; เก็บ input และผลคำนวณแต่ละรุ่นแบบ immutable |
| `BILL_PARTICIPANTS` | bill/user unique, `user_id → USERS`, membership อ้าง `GANG_MEMBERS.id`, ลำดับคงที่/ชื่อ snapshot/treated; เก็บประวัติคนร่วม ไม่ผูกกับแถวสมาชิกที่ยัง active อย่างเดียว |
| `BILL_ITEMS`, `BILL_ITEM_SHARERS` | revision, ชื่อ/item_key, qty, unit_price_satang nullable เฉพาะ draft, คนออกเงินแทน default; sharers FK ต้องอยู่ในบิลเดียวกัน; รายการสำหรับทุกคนต้องขยายเป็น snapshot ตอน publish |
| `BILL_FUNDING`, `BILL_SHARES` | ต่อ revision/participant: จำนวนที่ออกให้ร้านและส่วนที่รับผิดชอบจริง; เซิร์ฟเวอร์คำนวณจาก input, ตรวจ sum(funding)=sum(shares)=ยอดจริง; equal mode รับยอดรวมและผู้ที่ออกเงิน, by_item รับรายการและผู้กิน |
| `BILL_TRANSFERS` | revision, from/to participant, exact_satang, due_satang, rounding_extra_satang, version; immutable จำนวนเงินหลัง publish, ห้ามโอนให้ตัวเอง; due_satang = ceil(exact/100)×100 ตาม #53, extra = due−exact |
| `BILL_TRANSFER_EVENTS` | transfer, actor, reported_paid/confirmed_received/retracted/disputed, เวลา, idempotency key; แยกหลักฐานคนโอนกับคนรับ ไม่ใช้ boolean settled หรือ key `from>to:amount` จากเครื่องเป็นหลักฐานชำระเงินจริง |
| `GROUP_POLLS` | gang, meetup nullable, kind time/restaurant, creator, question, version, open/closed/cancelled, closes_at, closed_at, selected_option_id; time poll ผูกนัดเดิมและเก็บ base_schedule_version ตามข้อเสนอ Q7 |
| `POLL_OPTIONS` | poll + option UUID; time = starts_at/ends_at/timezone; restaurant = ชื่อ/ที่อยู่/ลิงก์ snapshot (ไม่พึ่ง ID ใน localStorage หรือ Google API); FK ผลเลือกต้องอยู่ใน poll เดียวกัน |
| `POLL_ELECTORS`, `POLL_BALLOTS`, `POLL_CHOICES` | electorate snapshot อ้าง user/membership; ballot unique(poll,user), version, answered_at; choices อ้าง options ใน poll เดียวกัน; แทนคำตอบทั้งหมดใน transaction เดียว; guest scope/สมาชิกเข้าออกยังรอ Q5/Q9 |
| `ACTION_REQUESTS` | unique(actor,route,idempotency_key), request_hash, resource/event reference และ response reference สำหรับ retry create/payment/close โดยไม่สร้างรายการซ้ำ |

เงินที่ออกให้ร้าน, เงินที่เพื่อนแจ้งว่าโอนแล้ว และเงินที่ผู้รับยืนยัน เป็นคนละข้อเท็จจริง ห้ามใช้แทนกัน
ห้าม publish draft ที่ยังขาดราคา/ผู้ร่วม/ยอดออกให้ร้านไม่ครบ หรือเชื่อยอดหารที่ client ส่งมา
นิยามว่าหนี้ปิดเมื่อใดและแก้บิลที่เคยจ่ายอย่างไร **รอ Q1–Q4**; ไม่เปิดใช้เงินออนไลน์ก่อนตอบ

## 2. API และ shared contract ที่เสนอ

เพิ่มภายหลังใน `packages/shared/src/{bills,polls,pending}.ts` พร้อม exports; ไม่เปลี่ยน `HomeSummary.pending`/`PendingItem` เดิมเงียบ ๆ
เส้นทางด้านล่างเป็น bare Nest routes; production frontend เรียกด้วย `/api` ตามระบบเดิม
ใช้ session/Origin policy เดิม, JSON validation, `Cache-Control: no-store`; POST create คืน 201, reads/updates คืน 200

### Types สำคัญ

- `MoneySatang = number`: safe nonnegative integer ใน JSON; DB bigint พร้อมขอบเขตที่ serialize ได้; ยอดโอนเป็นพหุคูณ 100
- `CreateBillRequest = { gangId, meetupId?, title, mode, participantUserIds[], defaultPayerUserId?, totalSatang?, funding?: {userId, amountSatang}[], items?: {name, qty, unitPriceSatang: number|null, eaterUserIds[], payerUserId?}[] }`; mode แยก required fields, treated flag เปิดหลัง Q4
- `BillDetail = { id, gangId, meetupId, title, state, revision, version, participants, items, funding, shares, totalSatang, roundingExtraSatang, myTransfers }`; รายละเอียดการเงินคนอื่นขึ้นกับ Q3
- `Transfer = { id, billId, revision, from: PersonCard, to: PersonCard, exactSatang, dueSatang, roundingExtraSatang, reportedPaidAt, confirmedReceivedAt, state, version }`; state mapping รอ Q2 ไม่สรุปว่าการกดฝั่งเดียวทำให้ cleared
- `CreatePollRequest = { kind, gangId, meetupId?, question, closesAt, options: TimeOption[]|RestaurantOption[] }`; เวลาใช้ ISO UTC + timezone Asia/Bangkok; ตัวเลือกชนิดเดียวกับ poll
- `PollDetail = { id, kind, gangId, meetupId, question, version, state, closesAt, options, myOptionIds, hasAnswered, eligibleCount, answeredCount, result }`; ไม่คืน user→choices ของคนอื่น; เปิดเผย tally/result เมื่อใดรอ Q8
- `TimeOption = {id,startsAt,endsAt,timezone}`; `RestaurantOption = {id,name,address?,mapUrl?}`; ตอน create ให้ server สร้าง id; `BallotAck = {pollId,version,myOptionIds,hasAnswered,answeredAt}`
- `BillSummary = {id,title,gangId,meetupId,state,revision,myDueSatang,myReceivableSatang}`; `PollSummary = {id,kind,question,gangId,meetupId,state,version,closesAt,hasAnswered}`; `CursorPage<T> = {items:T[],nextCursor:string|null}` เดิม
- `PendingActionV1 = { key, kind, entityId, gang: {id,name}, subject, actionableSince, version, actionable, data }`; discriminated union ด้านล่าง ไม่ส่งประโยคภาษาไทยสำเร็จรูป

| Endpoint | Request → Response / หน้าที่ |
|---|---|
| `POST /bills` | CreateBillRequest → draft BillDetail |
| `GET /bills?gangId&cursor&limit`, `GET /bills/:id` | หน้าบิลที่ caller มีสิทธิ์ / BillDetail |
| `PATCH /bills/:id` | `{expectedVersion, ...draftChanges}` → BillDetail; สิทธิ์แก้และการแก้หลัง publish รอ Q3 |
| `POST /bills/:id/publish` | `{expectedVersion}` → BillDetail + immutable revision/transfers; คำนวณใหม่ฝั่ง server |
| `POST /bills/:id/cancel` | `{expectedVersion, reason}` → BillDetail; เงื่อนไขเงินที่จ่ายแล้วรอ Q3, ไม่ DELETE ประวัติ |
| `GET /bills/:id/transfers?direction=incoming|outgoing&cursor&limit` | CursorPage<Transfer> ของ caller สำหรับขยายแถวใน Home |
| `POST /bill-transfers/:id/report-paid` | `{expectedVersion, revision}` → Transfer; ผู้เป็น from กด “จ่ายแล้ว” ของตัวเอง |
| `POST /bill-transfers/:id/confirm-received` | `{expectedVersion, revision}` → Transfer; ผู้เป็น to ยืนยันรับเงินของตัวเอง; จะต้องมี report ก่อนหรือไม่รอ Q2 |
| `POST /bill-transfers/:id/retract`, `/dispute` | `{expectedVersion, revision, reason?}` → Transfer; ผู้มีสิทธิ์/ขั้นตอนกลับรายการรอ Q2–Q3 |
| `POST /polls`, `GET /polls?gangId&cursor&limit`, `GET /polls/:id` | CreatePollRequest → PollDetail / CursorPage<PollSummary> / PollDetail |
| `PUT /polls/:id/ballot` | `{version, optionIds[]}` → own BallotAck; time เลือกทุกช่วงที่ว่าง, restaurant multi-select; `[]` = ตอบแล้วว่าไม่สะดวกเลย (รอ Q8) |
| `DELETE /polls/:id/ballot?version=` | → BallotAck ที่ hasAnswered=false; กลับเป็นยังไม่ตอบ ไม่ใช่คำตอบว่าง |
| `POST /polls/:id/close`, `/cancel` | `{expectedVersion}` → PollDetail; ใครปิด/ยกเลิกได้รอ Q7; ปิด/หมดเวลาแข่งกับ vote ต้อง lock poll |
| `POST /polls/:id/resolve` | `{expectedVersion, optionId?, method: 'manual'|'random'|'runoff'}` → PollDetail; คิดผล/บันทึกสุ่มครั้งเดียวบน server; กติกาเสมอ/ไม่มีตัวเลือกร่วมรอ Q8 |
| `GET /pending?cursor&limit` | PendingPageV1 ตามรายละเอียดถัดไป; ไม่เพิ่ม endpoint แยกสำหรับ swipe |
| `PUT /meetups/:id/response` เดิม | `{response:'going'|'not_going',scheduleVersion}` → MeetupDetailV1 เดิม; API ยังคงรองรับ maybe ตาม contract เก่า |

ทุก write ใช้ version ป้องกัน stale state; create/publish/payment/close/resolve รับ `Idempotency-Key` ต่อ actor+route+request hash (key เดิม body ต่างคืน 409)
ล็อก resource และตรวจสิทธิ์/เวลา/version ใหม่ใน transaction เดียวกับ event และ notification; ไม่เชื่อ actorId, amountDue หรือ state จาก client; อ่าน/ตอบ poll ตรวจ deadline ด้วยเวลาฝั่ง server แม้ background job ยังไม่ทำงาน
ผลโหวตเวลาไม่เปลี่ยน `MEETUPS.starts_at` อัตโนมัติจนตอบ Q7; เมื่อตกลงแล้วต้องใช้กติกา scheduleVersion/reconfirm เดิม ไม่เรียก API ที่ยังไม่มีว่าใช้งานได้แล้ว

### หนึ่ง list สำหรับ Home และตอบทีละรายการ

`PendingPageV1 = {items: PendingActionV1[], nextCursor: string|null, totalCount: number, actionableCount: number}`
limit default 20/max 50; keyset `(actionableSince DESC, kind DESC, key DESC)` เก็บความละเอียด timestamp; cursor versioned ผูก viewer/filters
page และ counts คำนวณจาก query สิทธิ์เดียวกันใน read-only consistent snapshot; ไม่ใช่จำนวนในหน้าปัจจุบันและไม่ใช่ notification unreadCount

| kind / stable key | data และเงื่อนไขอยู่ใน list |
|---|---|
| `meetup_reply` / meetup+user | meetupId, startsAt, scheduleVersion, choices going/not_going; ยังไม่ตอบ/ต้อง reconfirm, ไม่ซ่อน, ไม่ locked; คง horizon 14 วันเดิมของ `useWaiting` จน Q10 ตัดสิน |
| `time_vote`, `restaurant_vote` / poll+user | pollId, version, closesAt, options, myOptionIds; มีสิทธิ์, เปิดอยู่, ยังไม่ตอบ; hasAnswered แยกจาก choices ว่าง |
| `pay_bill` / transfer+from | transferId, revision, version, dueSatang, creditor; หนี้ของตัวเองที่ยังต้องแจ้งจ่ายตาม state policy Q2 |
| `collect_bill` / bill+to | billId, outstandingSatang, debtorCount, awaitingConfirmationCount, transfersUrl; แถว “เพื่อนยังค้าง 2 คน” รวมเฉพาะเงินที่จะรับของ caller; ขยายรับรองรายโอนได้ในแถว ไม่ยืนยันทุกคนรวดเดียว |

แถว collect ที่ยังไม่มีสิ่งให้ยืนยันส่ง `actionable:false`; จะรวมใน badge/swipe หรือไม่รอ Q10 จึงให้ทั้งสอง count ไว้ชัดเจน
`actionableSince` เป็นเวลาที่เกิดหน้าที่นั้นจริง เช่น publish/เปิด poll/report-paid ไม่ใช่เวลา GET; stable key ไม่เปลี่ยนเมื่อ refresh
mutation คืน resource ปัจจุบัน; frontend invalidate pending/badges/detail และ rollback optimistic action เมื่อผิดพลาด โหมด list/swipe ใช้ query key เดียวกัน
ไม่ทำ pending rows เป็น notification และไม่สร้างยอดนับที่ต้องคอยแก้หลายที่

Errors: 400 `INVALID_REQUEST`, `INVALID_AMOUNT`, `INVALID_OPTION`; 401 `UNAUTHENTICATED`; 403 `ORIGIN_NOT_ALLOWED`/`ACTION_NOT_ALLOWED` เมื่อรู้จัก resource แล้ว;
404 `BILL_NOT_FOUND`/`TRANSFER_NOT_FOUND`/`POLL_NOT_FOUND` เมื่อไม่มีหรือไม่มีสิทธิ์; 409 `VERSION_CONFLICT`, `BILL_NOT_READY`, `POLL_CLOSED`, `INVALID_PAYMENT_STATE`, `IDEMPOTENCY_CONFLICT`; 503 `{feature}_UNAVAILABLE` แบบ sanitized
meetup คง `MEETUP_VERSION_CONFLICT`/`RESPONSE_LOCKED` เดิม; ห้าม response/error/count หลุดข้อมูลคนที่ไม่มีสิทธิ์

## 3. สิทธิ์และ privacy

- ข้อเสนอเริ่มต้น: ผู้เข้าสู่ระบบซึ่ง active ในแก๊งสร้าง draft/poll ได้; บิลเปิดให้เฉพาะผู้ร่วมบิล ไม่ใช่เพื่อนทุกคนหรือสมาชิกทั้งแก๊ง (รอ Q3)
- “คนออกให้ร้าน” อาจต่างจากผู้สร้างบิล/ลูกหนี้/ผู้รับโอน; from แจ้งเฉพาะโอนของตัวเอง, to รับรองเฉพาะยอดที่ตัวเองรับ ไม่มีสิทธิ์พิเศษจาก `GANGS.created_by`
- การยืนยันหนึ่งฝั่งหรือสองฝั่งจะมีผลเป็น settled อย่างไร, รับรองก่อนอีกฝั่งรายงานได้หรือไม่, ใครย้อนกลับได้: **ยังไม่ตัดสิน Q2**
- โหวต authenticated เริ่มจาก electorate snapshot; แต่ละ user แก้ได้เฉพาะ ballot ตัวเอง; ไม่คืน choices/รายชื่อผู้โหวตคนอื่น; counts/results เปิดตาม Q8
- สมาชิกใหม่ไม่รับหนี้หรือสิทธิ์ในบิลเก่าโดยอัตโนมัติ; ออกจากแก๊งต้องรักษาประวัติ ไม่ cascade ลบหรือทำเครื่องหมายว่า “จ่ายแล้ว”
- ตาม ERD การออกแก๊งยกเลิกสิทธิ์ข้อมูลแก๊ง; ข้อยกเว้นให้คู่โอนอ่าน/ชำระบิลเก่าและการนับ electorate ต้องให้ Earth ตัดสิน Q5 ก่อนเปิดใช้
- ซ่อนนัด: ต้องกรองก่อน list/count/notification ของนัดและ time poll ที่ผูกนัด ไม่ส่ง hidden IDs/counts; ผลต่อหน้าที่บิลและการนับโหวตรอ Q6/Q8 ไม่ถือว่าซ่อนแล้วหนี้หาย
- block ไม่ลบภาระการเงิน/สมาชิกแก๊ง (#44); ใช้ชื่อ/รูปเท่าที่จำเป็นต่อธุรกรรม ไม่ให้เปิด profile ที่ถูก block หรือเผย birthday/gender

## 4. Notifications / activity เดิม

ขยาย `app_notifications` ไม่สร้างระบบใหม่; เพิ่ม bill_id/transfer_id/poll_id nullable + kind/target ที่เกี่ยวข้อง และ dedupe key `(event_id,recipient_id,kind)`
write domain event + notification ใน transaction เดียวกัน, ตรวจสิทธิ์/target/hidden ซ้ำตอนอ่านแบบ `ActivityService`; ไม่ใช้ blanket block filter เดิมจนการเงินของคู่โอนหาย (ข้อยกเว้นรอ Q6)

| เหตุการณ์ | ผู้รับ / kind ที่เสนอ |
|---|---|
| publish บิล | ผู้ร่วมที่มีหนี้ ไม่ส่งให้คนสร้างซ้ำ / bill_issued |
| แจ้งจ่าย | ผู้รับเงินเท่านั้น / payment_reported |
| รับรองรับเงิน | ผู้แจ้งโอน / payment_confirmed; “จ่ายครบ” คำนวณหลัง Q2 เท่านั้น |
| ย้อน/คัดค้าน/แก้/ยกเลิก | เฉพาะผู้ได้รับผล / payment_retracted, payment_disputed, bill_revised, bill_cancelled |
| เปิด/เปลี่ยนรุ่น poll | ผู้มีสิทธิ์ตอบ / vote_opened, vote_revised |
| ปิด/เลือกผล/ยกเลิก poll | electorate ที่ยังดู resource ได้ / vote_closed, vote_resolved, vote_cancelled |

ไม่แจ้งกลุ่มทุกครั้งที่ลง ballot เพราะรบกวนและอาจเผยตัวผู้โหวต; ไม่เพิ่ม LINE push หรือ reminder scheduler ในเฟสนี้
feed `bill_paid` เดิมจะเกิดได้เมื่อสถานะปิดตามกติกาที่อนุมัติแล้วเท่านั้น ไม่อ้างว่ากด “จ่ายแล้ว” = เงินเข้าธนาคาร

## 5. Migration, mocks และการตรวจในเฟส implement

- เฟสนี้ไม่มี migration; หลังอนุมัติค่อยเพิ่มตาราง/FK/index แบบ additive และขยาย notification kind/refs โดยให้แถวเดิมอ่านได้ ไม่มี reset/seed ทับข้อมูลเดิม
- index: bills(gang,publishedAt,id), transfers(from/state และ to/state), polls(gang,state,closesAt,id), ballot(poll,user); shared snapshot query สำหรับ pending/count/permissions
- ไม่ import localStorage หรือแปลง mock IDs/ชื่อเป็น user จริงอัตโนมัติ; ต้องมี explicit mapping + consent ก่อน sync บิลเก่า (Q4)
- คง shared exports, `/home`, meetup/room APIs และ notifications เดิมระหว่างเปลี่ยน frontend; new shared types เป็น V1 แยก ไม่เปลี่ยน game_rooms ซึ่ง TTL 3 ชั่วโมงและไม่เหมาะเก็บโหวตถาวร
- frontend จะเพิ่ม MSW handlers ใหม่เองตาม contract นี้; demo ไม่ต้องมี DB และห้าม fallback ไป API จริง; local bill/quick-vote tools ยังใช้ offline ได้ตามเดิม
- fixtures แบบ deterministic: 8 แถว pending = นัด 2 + time poll 2 + restaurant poll 1 + payable 2 + collector 1; อีกบัญชีต้องไม่เห็นหนี้/ballot ที่ไม่มีสิทธิ์
- ทดสอบเงิน: 100 บาท/3 คน, ออกให้ร้านคนเดียว → โอน 34+34 บาท และ rounding extra 1.34 บาทตาม algorithm ปัจจุบัน; assert แยกยอดจริง/ยอดเรียกเก็บ ไม่กำหนดปลายทางส่วนเกินแทน Q1
- ทดสอบรายการขาดราคา/หลายคนออก/เลี้ยง, duplicate report/confirm, stale revision, edit แข่ง payment, สมาชิกเข้าออก, hidden/block, ballot ว่าง/ถอน/หมดเวลา/เสมอ, counts ข้ามหน้าและ list/swipe ตรงกัน; terminal money assertions รอคำตอบ
- ลำดับเสนอ: ตัดสิน Q1–Q10 → shared contracts/fixtures → migration + bills/payments → polls → pending/notifications → frontend handlers/integration/concurrency tests

## 6. รอพี่ตัดสิน

1. **เศษปัดขึ้น:** คงปัดขึ้นเป็นบาทเต็มต่อโอนตาม #53; ส่วนเกินเป็นของผู้รับเลย เป็นเครดิต หรือคืน/ชดเชยอย่างไร? ต้องแสดงความยินยอมก่อน publish ไหม?
2. **ยืนยันเงิน:** คนโอนกด “จ่ายแล้ว” แล้วต้องให้ผู้รับรับรองก่อนปิดหนี้หรือไม่? ผู้รับกดรับเงินได้ก่อนคนโอนรายงานไหม? ฝั่งใดถอน/คัดค้านคำยืนยันของตัวเองได้ถึงเมื่อใด?
3. **สิทธิ์/แก้บิล:** ผู้สร้างเท่านั้นหรือผู้ร่วมบิลแก้/ปิดได้? ผู้ร่วมเห็นทั้งบิลหรือเฉพาะยอดตัวเอง? ถ้ามีรายงาน/รับรองแล้ว จะห้ามแก้, ให้ทุกฝ่ายยอมรับ revision ใหม่ หรือสร้างบิลปรับยอดแยก?
4. **ขอบเขตเงินรอบแรก:** รองรับหลายคนออกให้ร้านและเลี้ยงเหมือน local ทั้งหมดเลยไหม? ต้องมีจ่ายบางส่วน/เงินเกิน/คืนเงินหรือไม่? รายการชื่อคนไม่มีบัญชีและบิลในเครื่องจะเชื่อม user จริงอย่างไรโดยเจ้าตัวยินยอม?
5. **ออกแก๊ง/เพิ่มสมาชิก:** คู่โอนยังดูและชำระบิลเดิมได้หรือเสียสิทธิ์ตาม ERD? ผู้โหวตที่ออกแก๊งยังนับคำตอบเดิมไหม และคนเข้าใหม่เข้าร่วม poll ที่เปิดแล้วได้หรือไม่?
6. **ซ่อนนัด/block:** งานบิลที่ผูกนัดยังแสดงใน “รอเราตอบ” ไหมเมื่อซ่อนนัด? การแจ้งเตือนส่วนตัวคู่โอนที่ block กันควรยังส่งไหม โดยไม่เผย hidden attendance หรือเปิด profile?
7. **โหวตเวลา/อำนาจปิด:** โหวตก่อนมีนัด (ต้องมี draft meetup) หรือปรับนัดที่มีเวลาอยู่แล้ว? ผู้สร้างหรือสมาชิกใดปิด/เลือกผลได้? ผลต้องให้คนยืนยันก่อนเปลี่ยนเวลาและ reset scheduleVersion ใช่ไหม?
8. **กติกาโหวต:** ตอบ “ไม่สะดวกทุกตัวเลือก” ได้ไหม, แก้/ถอนถึง deadline ได้ไหม, เห็นคะแนนระหว่างโหวตหรือหลังปิด, ปิดเมื่อครบทุกคนอัตโนมัติไหม? ร้านใช้กติการ้านร่วม/สุ่มเดิมหรือให้เลือกเอง และเสมอ/ไม่มีร้านร่วมทำอะไร?
9. **ผู้ไม่มีบัญชี:** โหวตผ่านลิงก์+nickname ตาม #14 ต้องมีในเฟสแรกหรือทำ authenticated gang polls ก่อน? หากมี guest ต้องแยก token/session และไม่ให้สิทธิ์บิล/แก๊ง
10. **badge/swipe:** แถว “เพื่อนยังค้าง 2 คน” ที่ยังไม่มีใครแจ้งจ่าย ให้นับเป็นงานตอบหรือแสดงข้อมูลเฉย ๆ? badge นับหนึ่งแถวต่อบิลหรือรายโอน? นัดใน pending คงขอบเขต 14 วันเดิมหรือเอาทุกนัดที่ยังตอบได้?

หลักอ้างอิงทางเทคนิค: [PostgreSQL row locks](https://www.postgresql.org/docs/18/explicit-locking.html), [OWASP object-level authorization](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/)
