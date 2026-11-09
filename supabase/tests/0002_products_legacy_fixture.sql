-- LOCAL TESTING ONLY: fake products as the current CRM saves them.
insert into public.crm_records (record_type, record_key, data) values
 ('products','p20','{"id":"p20","category":"Frozen Fruits","name":"Frozen Mangoes","kg":"10","grossKg":"9","cpp":"100","price":"1200","priceCur":"USD","packing":""}'),
 ('products','p13','{"id":"p13","category":"Citrus","name":"Keitt Mango","kg":"","cost":""}'),
 ('products','p12','{"id":"p12","category":"Citrus","name":"Lemon","kg":"","cost":""}'),
 ('products','p99','{"id":"p99","category":"Citrus","name":"Lemons","kg":"abc"}'),
 ('products','p50','{"id":"p50","category":"Other","name":"","kg":"5"}');

-- fake customers / leads as the current CRM saves them (used by 0006 tests)
insert into public.crm_records (record_type, record_key, data, owner_legacy_id) values
 ('customers','c1','{"id":1,"company":"Gulf Fresh Trading LLC","country":"UAE","city":"Dubai","type":"Importer","contact":"Ahmed Ali","job":"Buyer","email":"ahmed@gulffresh.ae","phone":"+971 50 123 4567","products":"Mango, Dragon Fruit","category":"Fresh","status":"Quotation Sent","priority":"High","last":"2026-10-01","next":"2026-11-20"}','u1'),
 ('customers','c2','{"id":2,"company":"Euro Frozen BV","country":"Netherlands","type":"Food Service","contact":"","email":"","status":"Weird","priority":"","next":"not a date"}','u2'),
 ('leads','l1','{"id":3,"company":"Saudi Foods Co.","country":"Saudi Arabia","contact":"Omar","email":"omar@saudifoods.sa","products":"Okra","next":"2026-12-01","status":"New Lead"}','u2'),
 ('leads','l2','{"id":4,"company":"  ","country":"X"}','u2'),
 ('customers','c3','{"id":5,"company":"No Owner Ltd","country":"UK"}', 'u9');
