-- LOCAL TESTING ONLY: fake products as the current CRM saves them.
insert into public.crm_records (record_type, record_key, data) values
 ('products','p20','{"id":"p20","category":"Frozen Fruits","name":"Frozen Mangoes","kg":"10","grossKg":"9","cpp":"100","price":"1200","priceCur":"USD","packing":""}'),
 ('products','p13','{"id":"p13","category":"Citrus","name":"Keitt Mango","kg":"","cost":""}'),
 ('products','p12','{"id":"p12","category":"Citrus","name":"Lemon","kg":"","cost":""}'),
 ('products','p99','{"id":"p99","category":"Citrus","name":"Lemons","kg":"abc"}'),
 ('products','p50','{"id":"p50","category":"Other","name":"","kg":"5"}');
