// Generates the sample CSVs in fixtures/. Deterministic (seeded), so the files are stable.
// All people, emails, phones and addresses are fake (example.com / 555-01xx numbers).
//
//   node scripts/make-fixtures.js

import { writeFileSync, mkdirSync } from 'node:fs';
import { toCSV } from '../src/csv.js';

const OUT = new URL('../fixtures/', import.meta.url);
mkdirSync(OUT, { recursive: true });

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = mulberry32(42);
const pick = a => a[Math.floor(rand() * a.length)];
const chance = p => rand() < p;
const reseed = s => { rand = mulberry32(s); };

// Catalog. `bias` per size: [return probability, P(small | size return), P(large | size return), share of returns that are size-related]
const CATALOG = [
  { title: 'Classic Crew Tee', code: 'CCT', price: 28, colors: ['Black', 'White'], weight: 5,
    sizes: { XS: [0.1, 0.8, 0.2, 0.6], S: [0.22, 0.9, 0.1, 0.8], M: [0.2, 0.9, 0.1, 0.8], L: [0.16, 0.85, 0.15, 0.7], XL: [0.06, 0.5, 0.5, 0.3], XXL: [0.05, 0.4, 0.6, 0.3] } },
  { title: 'High Rise Straight Jean', code: 'HRJ', price: 89, colors: ['Indigo', 'Black'], weight: 4,
    sizes: { 24: [0.08, 0.5, 0.5, 0.4], 26: [0.08, 0.5, 0.5, 0.4], 28: [0.24, 0.1, 0.9, 0.8], 30: [0.22, 0.1, 0.9, 0.8], 32: [0.09, 0.5, 0.5, 0.4] } },
  { title: 'Linen Wrap Dress', code: 'LWD', price: 120, colors: ['Sand', 'Olive'], weight: 3,
    sizes: { XS: [0.07, 0.5, 0.5, 0.15], S: [0.07, 0.5, 0.5, 0.15], M: [0.07, 0.5, 0.5, 0.15], L: [0.07, 0.5, 0.5, 0.15], XL: [0.07, 0.5, 0.5, 0.15] } },
  { title: 'Ribbed Knit Cardigan', code: 'RKC', price: 95, colors: ['Cream'], weight: 3,
    sizes: { S: [0.06, 0.5, 0.5, 0.2], M: [0.06, 0.5, 0.5, 0.2], L: [0.07, 0.5, 0.5, 0.2], XL: [0.3, 0.05, 0.95, 0.85] } },
  { title: 'Everyday Hoodie', code: 'EDH', price: 65, colors: ['Grey'], weight: 0.6,
    sizes: { S: [0.1, 0.7, 0.3, 0.6], M: [0.1, 0.7, 0.3, 0.6], L: [0.1, 0.7, 0.3, 0.6], XL: [0.1, 0.7, 0.3, 0.6] } },
  { title: 'Canvas Tote', code: 'CTB', price: 35, colors: ['Natural'], weight: 1, sizes: { 'One Size': [0.03, 0.5, 0.5, 0] } },
];
const SIZE_LIST = p => Object.keys(p.sizes);
const totalWeight = CATALOG.reduce((a, p) => a + p.weight, 0);
function pickProduct() {
  let r = rand() * totalWeight;
  for (const p of CATALOG) { r -= p.weight; if (r <= 0) return p; }
  return CATALOG[0];
}
const skuOf = (p, color, size) => `${p.code}-${color.slice(0, 3).toUpperCase()}-${size === 'One Size' ? 'OS' : size}`;
const variantOf = (p, color, size) => (size === 'One Size' ? color : `${size} / ${color}`);

const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Jamie', 'Avery', 'Quinn'];
const LAST = ['Example', 'Sample', 'Testcase', 'Placeholder', 'Demo'];
const STREETS = ['Maple Ave', 'Oak St', 'Pine Rd', 'Cedar Ln', 'Elm Ct'];
const CITIES = [['Portland', 'OR', '97201'], ['Austin', 'TX', '73301'], ['Denver', 'CO', '80014'], ['Columbus', 'OH', '43004']];
function person(i) {
  const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
  const [city, prov, zip] = CITIES[i % CITIES.length];
  return {
    name,
    email: `buyer${1000 + i}@example.com`,
    phone: `+1 555-01${String(i % 100).padStart(2, '0')}`,
    street: `${100 + (i % 800)} ${STREETS[i % STREETS.length]}`,
    city, prov, zip,
  };
}

function sizeOutcome(p, size) {
  const [pRet, pSmall, , pSizeRelated] = p.sizes[size];
  if (!chance(pRet)) return null;
  if (!chance(pSizeRelated)) return { kind: 'other' };
  return { kind: chance(pSmall) ? 'small' : 'large' };
}
const neighbour = (p, size, dir) => {
  const list = SIZE_LIST(p);
  const i = list.indexOf(size);
  return list[i + (dir === 'small' ? 1 : -1)] || null;
};

// ---------------------------------------------------------------- 1. Shopify orders export
// Header list from help.shopify.com/en/manual/orders/manage-orders/exporting-orders.
const SHOPIFY_HEADERS = ['Name', 'Email', 'Financial Status', 'Paid at', 'Fulfillment Status', 'Fulfilled at',
  'Accepts Marketing', 'Currency', 'Subtotal', 'Shipping', 'Taxes', 'Total', 'Discount Code', 'Discount Amount',
  'Shipping Method', 'Created at', 'Lineitem quantity', 'Lineitem name', 'Lineitem price', 'Lineitem compare-at price',
  'Lineitem SKU', 'Lineitem requires shipping', 'Lineitem taxable', 'Lineitem fulfillment status',
  'Billing Name', 'Billing Street', 'Billing Address1', 'Billing Address2', 'Billing Company', 'Billing City',
  'Billing Zip', 'Billing Province', 'Billing Province Name', 'Billing Country', 'Billing Phone',
  'Shipping Name', 'Shipping Street', 'Shipping Address1', 'Shipping Address2', 'Shipping Company', 'Shipping City',
  'Shipping Zip', 'Shipping Province', 'Shipping Province Name', 'Shipping Country', 'Shipping Phone',
  'Notes', 'Note Attributes', 'Canceled at', 'Payment Method', 'Payment Reference', 'Payment References',
  'Refunded Amount', 'Vendor', 'Outstanding Balance', 'Employee', 'Location', 'Device ID', 'Id', 'Tags',
  'Risk Level', 'Source', 'Lineitem discount', 'Tax 1 Name', 'Tax 1 Value', 'Phone', 'Payment ID',
  'Payment terms', 'Next payment due at', 'Checkout fees'];

reseed(42);
const orderRows = [];
for (let n = 0; n < 1400; n++) {
  const who = person(n);
  const lines = [];
  const count = chance(0.7) ? 1 : chance(0.7) ? 2 : 3;
  for (let k = 0; k < count; k++) {
    const p = pickProduct();
    const size = pick(SIZE_LIST(p));
    const color = pick(p.colors);
    lines.push({ p, size, color, qty: chance(0.92) ? 1 : 2, out: sizeOutcome(p, size) });
  }
  const subtotal = lines.reduce((a, l) => a + l.p.price * l.qty, 0);
  const returned = lines.filter(l => l.out);
  let status = 'paid';
  let refunded = 0;
  if (returned.length === lines.length) { status = 'refunded'; refunded = subtotal; }
  else if (returned.length) { status = 'partially_refunded'; refunded = returned.reduce((a, l) => a + l.p.price * l.qty, 0); }
  const day = String(1 + (n % 28)).padStart(2, '0');
  const month = String(5 + Math.floor(n / 280)).padStart(2, '0');
  const created = `2026-${month}-${day} 1${n % 10}:2${n % 6}:00 -0400`;
  lines.forEach((l, k) => {
    const row = {
      Name: `#${1001 + n}`, Email: who.email,
      'Lineitem quantity': l.qty, 'Lineitem name': `${l.p.title} - ${variantOf(l.p, l.color, l.size)}`,
      'Lineitem price': l.p.price.toFixed(2), 'Lineitem compare-at price': '', 'Lineitem SKU': skuOf(l.p, l.color, l.size),
      'Lineitem requires shipping': 'true', 'Lineitem taxable': 'true', 'Lineitem fulfillment status': 'fulfilled',
      'Lineitem discount': '0.00',
    };
    if (k === 0) {
      Object.assign(row, {
        'Financial Status': status, 'Paid at': created, 'Fulfillment Status': 'fulfilled', 'Fulfilled at': created,
        'Accepts Marketing': chance(0.4) ? 'yes' : 'no', Currency: 'USD', Subtotal: subtotal.toFixed(2),
        Shipping: '0.00', Taxes: '0.00', Total: subtotal.toFixed(2), 'Discount Code': '', 'Discount Amount': '0.00',
        'Shipping Method': 'Standard', 'Created at': created,
        'Billing Name': who.name, 'Billing Street': who.street, 'Billing Address1': who.street, 'Billing Address2': '',
        'Billing Company': '', 'Billing City': who.city, 'Billing Zip': who.zip, 'Billing Province': who.prov,
        'Billing Province Name': who.prov, 'Billing Country': 'US', 'Billing Phone': who.phone,
        'Shipping Name': who.name, 'Shipping Street': who.street, 'Shipping Address1': who.street, 'Shipping Address2': '',
        'Shipping Company': '', 'Shipping City': who.city, 'Shipping Zip': who.zip, 'Shipping Province': who.prov,
        'Shipping Province Name': who.prov, 'Shipping Country': 'US', 'Shipping Phone': who.phone,
        Notes: n % 17 === 0 ? `Gift for ${who.name}, leave at door` : '', 'Note Attributes': '',
        'Canceled at': '', 'Payment Method': 'Shopify Payments', 'Payment Reference': `c${20000 + n}.1`,
        'Payment References': `c${20000 + n}.1`, 'Refunded Amount': refunded ? refunded.toFixed(2) : '0.00',
        Vendor: 'Sample Apparel', 'Outstanding Balance': '0.00', Employee: '', Location: '', 'Device ID': '',
        Id: String(5600000000 + n), Tags: '', 'Risk Level': 'Low', Source: 'web', 'Tax 1 Name': '', 'Tax 1 Value': '',
        Phone: who.phone, 'Payment ID': `pay_${n}`, 'Payment terms': '', 'Next payment due at': '', 'Checkout fees': '',
      });
    }
    orderRows.push(row);
  });
}
writeFileSync(new URL('shopify_orders_export.csv', OUT), toCSV(SHOPIFY_HEADERS, orderRows));

// ---------------------------------------------------------------- 2. AfterShip Returns export
// Field names from support.aftership.com "Guide to export returns data".
const AS_HEADERS = ['RMA number', 'Request time', 'RMA status', 'RMA outcome', 'Customer name', 'Customer email',
  'Order number', 'Order country code', 'Order time', 'RMA return quantity', 'RMA notes', 'Return Method',
  'Return tracking number', 'Carrier', 'Exchange order number', 'Currency', 'Return item value',
  'Return product title', 'Return product SKU', 'Return reason', 'Sub-reason', 'Product price', 'Product tags',
  'SKU return quantity', 'Restocked quantity', 'Customer return notes', 'Customer return images',
  'Customer exchange notes'];
const SMALL_SUB = ['Chest too tight', 'Too short', 'Shoulders too narrow', 'Waist too tight'];
const LARGE_SUB = ['Too loose', 'Too long', 'Waist too loose', 'Too wide'];
const SMALL_NOTE = ['', '', 'Usually a M but this felt like a S', '胸围太紧了', 'runs small, size up', 'Could barely get it on'];
const LARGE_NOTE = ['', '', 'Way too baggy', '腰围偏大', 'Swimming in it', 'Need a smaller size'];
const OTHER_REASONS = [['Changed my mind', ''], ['Damaged or defective', 'Seam split'], ['Not as described', 'Colour different'], ['Other', '']];

reseed(7);
const asRows = [];
let rma = 0;
for (let i = 0; i < 4000; i++) {
  const p = pickProduct();
  const size = pick(SIZE_LIST(p));
  const out = sizeOutcome(p, size);
  if (!out) continue;
  const color = pick(p.colors);
  const who = person(3000 + i);
  let reason = '', sub = '', note = '', outcome = 'Refund', exNote = '';
  if (out.kind === 'other') {
    [reason, sub] = pick(OTHER_REASONS);
    if (reason === 'Other' && chance(0.3)) note = `Call me at ${who.phone} about this`;
  } else {
    const small = out.kind === 'small';
    reason = chance(0.85) ? (small ? 'Too small' : 'Too big') : 'Size/Fit';
    sub = chance(0.5) ? pick(small ? SMALL_SUB : LARGE_SUB) : '';
    note = pick(small ? SMALL_NOTE : LARGE_NOTE);
    const target = neighbour(p, size, out.kind);
    if (target && chance(0.45)) { outcome = 'Exchange'; exNote = `Please send a size ${target}`; }
  }
  rma++;
  asRows.push({
    'RMA number': `RMA-${10000 + rma}`, 'Request time': '2026-09-14 10:22:00', 'RMA status': 'Resolved',
    'RMA outcome': outcome, 'Customer name': who.name, 'Customer email': who.email,
    'Order number': `#${4001 + i}`, 'Order country code': 'US', 'Order time': '2026-09-01 08:00:00',
    'RMA return quantity': 1, 'RMA notes': '', 'Return Method': 'Ship with prepaid label',
    'Return tracking number': `1Z999AA1${String(i).padStart(8, '0')}`, Carrier: 'UPS',
    'Exchange order number': outcome === 'Exchange' ? `#E${4001 + i}` : '', Currency: 'USD',
    'Return item value': p.price.toFixed(2), 'Return product title': p.title, 'Return product SKU': skuOf(p, color, size),
    'Return reason': reason, 'Sub-reason': sub, 'Product price': p.price.toFixed(2), 'Product tags': 'apparel',
    'SKU return quantity': 1, 'Restocked quantity': 1, 'Customer return notes': note,
    'Customer return images': chance(0.2) ? `https://cdn.example.com/rma/${rma}.jpg` : '',
    'Customer exchange notes': exNote,
  });
}
writeFileSync(new URL('aftership_returns_export.csv', OUT), toCSV(AS_HEADERS, asRows));

// ---------------------------------------------------------------- 3. Loop Returns line items
// Field names from Loop's line-item schema (as exposed by the Fivetran Loop connector).
const LOOP_HEADERS = ['return_id', 'order_name', 'customer_email', 'line_item_id', 'title', 'sku', 'variant_id', 'price',
  'return_reason', 'parent_return_reason', 'return_comment', 'outcome', 'exchange_variant', 'returned_at'];
reseed(99);
const loopRows = [];
for (let i = 0; i < 3000; i++) {
  const p = pickProduct();
  const size = pick(SIZE_LIST(p));
  const out = sizeOutcome(p, size);
  if (!out) continue;
  const color = pick(p.colors);
  let reason, parent, outcome = chance(0.5) ? 'refund' : 'credit', ex = '', comment = '';
  if (out.kind === 'other') {
    [reason, parent] = pick([['Changed Mind', "Didn't Like"], ['Defective', 'Quality'], ['Not As Pictured', "Didn't Like"], ['Other', 'Other']]);
  } else {
    reason = out.kind === 'small' ? 'Too Small' : 'Too Large';
    parent = 'Size/Fit';
    const target = neighbour(p, size, out.kind);
    if (target && chance(0.6)) { outcome = 'exchange'; ex = variantOf(p, color, target); }
    if (chance(0.2)) comment = out.kind === 'small' ? 'tight across the back' : 'very roomy';
  }
  loopRows.push({
    return_id: 900000 + i, order_name: `#${7001 + i}`, customer_email: person(5000 + i).email,
    line_item_id: 1200000 + i, title: p.title, sku: skuOf(p, color, size), variant_id: 4400000 + i,
    price: p.price.toFixed(2), return_reason: reason, parent_return_reason: parent, return_comment: comment,
    outcome, exchange_variant: ex, returned_at: '2026-10-02T12:00:00Z',
  });
}
writeFileSync(new URL('loop_returns.csv', OUT), toCSV(LOOP_HEADERS, loopRows));

// ---------------------------------------------------------------- 4. Dirty export (unknown app, reasons mostly Other/blank)
// Header names don't match any known format; tests auto-guessing + manual mapping. CRLF + BOM.
const DIRTY_HEADERS = ['RMA ID', 'Order #', 'Customer', 'Customer Email', 'Ship To Address', 'Item', 'Variant', 'Item SKU',
  'Qty', 'Reason', 'Resolution', 'Comments'];
const WEIRD_SIZE = { XS: 'X-Small', S: 'Small', M: 'Size: M', L: 'large', XL: 'Extra Large', XXL: '2X', 'One Size': 'OS' };
reseed(1234);
const dirtyRows = [];
for (let i = 0; i < 900; i++) {
  const p = pickProduct();
  const size = pick(SIZE_LIST(p));
  const out = sizeOutcome(p, size);
  if (!out) continue;
  const color = pick(p.colors);
  const who = person(8000 + i);
  let reason = pick(['Other', 'Other', '', '', 'N/A', 'other']);
  let comment = '';
  if (out.kind !== 'other' && chance(0.18)) reason = out.kind === 'small' ? pick(['偏小', 'too tight', '太紧']) : pick(['偏大', 'too loose', '太大了']);
  else if (out.kind !== 'other' && chance(0.12)) reason = 'Wrong size';
  else if (out.kind === 'other' && chance(0.3)) reason = pick(['Damaged', '质量问题', 'Changed mind']);
  if (chance(0.1)) comment = `pls refund to ${who.email}`;
  const sizeText = chance(0.08) ? '' : (WEIRD_SIZE[size] || size);
  dirtyRows.push({
    'RMA ID': `R${50000 + i}`, 'Order #': `${9001 + i}`, Customer: who.name, 'Customer Email': who.email,
    'Ship To Address': `${who.street}, ${who.city} ${who.prov} ${who.zip}`, Item: p.title,
    Variant: sizeText ? `${sizeText} / ${color}` : color, 'Item SKU': sizeText ? '' : `${p.code}${i}`,
    Qty: 1, Reason: reason, Resolution: pick(['Refund', 'Store Credit']), Comments: comment,
  });
}
writeFileSync(new URL('dirty_returns.csv', OUT), '﻿' + toCSV(DIRTY_HEADERS, dirtyRows).replace(/\n/g, '\r\n'));

// ---------------------------------------------------------------- 5. Size chart (optional input)
const CHART = [
  ['Classic Crew Tee', 'Chest (cm)', { XS: 86, S: 92, M: 98, L: 104, XL: 110, XXL: 116 }],
  ['Classic Crew Tee', 'Length (cm)', { XS: 66, S: 68, M: 70, L: 72, XL: 74, XXL: 76 }],
  ['High Rise Straight Jean', 'Waist (cm)', { 24: 62, 26: 67, 28: 72, 30: 77, 32: 82 }],
  ['High Rise Straight Jean', 'Hip (cm)', { 24: 88, 26: 93, 28: 98, 30: 103, 32: 108 }],
  ['Ribbed Knit Cardigan', 'Chest (cm)', { S: 96, M: 102, L: 108, XL: 116 }],
];
const chartRows = new Map();
for (const [product, measure, bySize] of CHART) {
  for (const [size, v] of Object.entries(bySize)) {
    const k = `${product}|${size}`;
    if (!chartRows.has(k)) chartRows.set(k, { Product: product, Size: size });
    chartRows.get(k)[measure] = v;
  }
}
writeFileSync(new URL('size_chart.csv', OUT), toCSV(['Product', 'Size', 'Chest (cm)', 'Length (cm)', 'Waist (cm)', 'Hip (cm)'], [...chartRows.values()]));

console.log(`orders rows ${orderRows.length}, aftership ${asRows.length}, loop ${loopRows.length}, dirty ${dirtyRows.length}`);
