import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPiiHeader, detectFormat, loadFile } from '../src/formats.js';

test('PII headers are recognised', () => {
  for (const h of ['Email', 'Billing Name', 'Shipping Address1', 'Shipping Phone', 'Billing Zip', 'Customer name',
    'Customer email', 'customer_email', 'Phone', 'Notes', 'Ship To Address', 'Customer', 'Return tracking number',
    'Customer return images', 'Device ID', '收件人', 'First Name']) {
    assert.equal(isPiiHeader(h), true, h);
  }
});

test('analysis headers are kept', () => {
  for (const h of ['Lineitem name', 'Lineitem SKU', 'Return product title', 'Return reason', 'Customer return notes',
    'Customer exchange notes', 'return_customer_note', 'Shipping Method', 'Tax 1 Name', 'title', 'variant_title', 'Financial Status']) {
    assert.equal(isPiiHeader(h), false, h);
  }
});

test('format detection', () => {
  assert.equal(detectFormat(['Name', 'Email', 'Financial Status', 'Lineitem quantity', 'Lineitem name', 'Refunded Amount']), 'shopify_orders');
  assert.equal(detectFormat(['RMA number', 'Return product title', 'Return product SKU', 'Return reason', 'Sub-reason']), 'aftership');
  assert.equal(detectFormat(['title', 'sku', 'return_reason', 'parent_return_reason', 'exchange_variant', 'outcome']), 'loop');
  assert.equal(detectFormat(['product_title_at_time_of_sale', 'product_variant_title_at_time_of_sale', 'return_line_item_reason', 'returned_quantity']), 'shopify_returns');
  assert.equal(detectFormat(['Product', 'Size', 'Why']), 'generic');
});

test('loadFile drops PII values from rows', () => {
  const csv = 'Name,Email,Financial Status,Lineitem quantity,Lineitem name,Lineitem SKU,Refunded Amount,Billing Name\n'
    + '#1001,a@example.com,paid,1,Tee - M / Black,T-BLK-M,0.00,Alex Example\n';
  const f = loadFile('o.csv', csv);
  assert.equal(f.format, 'shopify_orders');
  assert.deepEqual(f.droppedColumns, ['Email', 'Billing Name']);
  assert.ok(!JSON.stringify(f.rows).includes('example.com'));
  assert.ok(!JSON.stringify(f.rows).includes('Alex'));
  assert.equal(f.rows[0].Name, '#1001'); // Shopify order number kept
});

test('a bare Name column holding person names is dropped', () => {
  const f = loadFile('x.csv', 'Name,Product,Variant,Reason\nAlex Example,Tee,M,Too small\n');
  assert.ok(f.droppedColumns.includes('Name'));
  assert.equal(f.mapping.product, 'Product');
  assert.equal(f.mapping.reason, 'Reason');
  assert.equal(f.kind, 'returns');
});
