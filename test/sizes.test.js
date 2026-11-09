import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSize, sizeFromVariant, sizeFromSku, sizeFromText, splitLineItemName, compareSizes } from '../src/sizes.js';

const s = x => x && x.size;

test('letter sizes in variant titles', () => {
  assert.equal(s(sizeFromVariant('M / Red')), 'M');
  assert.equal(s(sizeFromVariant('Red / M')), 'M');
  assert.equal(s(sizeFromVariant('Navy / XL')), 'XL');
  assert.equal(s(sizeFromVariant('Size: L')), 'L');
  assert.equal(s(sizeFromVariant('Black / 2XL')), 'XXL');
  assert.equal(s(sizeFromVariant('XXL')), 'XXL');
  assert.equal(s(sizeFromVariant('3XL / Sand')), '3XL');
  assert.equal(s(sizeFromVariant('Small')), 'S');
  assert.equal(s(sizeFromVariant('Extra Large / Olive')), 'XL');
  assert.equal(s(sizeFromVariant('X-Small')), 'XS');
  assert.equal(s(sizeFromVariant('尺码: M / 黑色')), 'M');
  assert.equal(sizeFromVariant('Black'), null);
});

test('numeric sizes', () => {
  assert.deepEqual(sizeFromVariant('28 / Indigo'), { size: '28', family: 'numeric', rank: 28 });
  assert.equal(s(sizeFromVariant('32W 30L')), '32');
  assert.equal(s(sizeFromVariant('US 8')), '8');
  assert.equal(s(sizeFromVariant('EU 38 / Black')), '38');
  assert.equal(s(sizeFromVariant('7.5')), '7.5');
});

test('letter size beats numeric codes in the same title', () => {
  assert.equal(s(sizeFromVariant('Colour 01 / M')), 'M');
});

test('one size is recognised and flagged', () => {
  assert.equal(sizeFromVariant('One Size').family, 'one');
  assert.equal(sizeFromVariant('OS').family, 'one');
});

test('sizes from SKUs', () => {
  assert.equal(s(sizeFromSku('TEE-BLK-M')), 'M');
  assert.equal(s(sizeFromSku('SKU-1023-BLK-XL')), 'XL');
  assert.equal(s(sizeFromSku('JEAN_IND_32')), '32');
  assert.equal(s(sizeFromSku('DRS-S-RED')), 'S'); // size in second-to-last segment
  assert.equal(sizeFromSku('HAT-1023-BLK'), null); // numbers only count in the last segment
});

test('Shopify line item names split into product and variant', () => {
  assert.deepEqual(splitLineItemName('Classic Tee - M / Black'), { product: 'Classic Tee', variant: 'M / Black' });
  assert.deepEqual(splitLineItemName('Wrap Dress - Floral - S'), { product: 'Wrap Dress - Floral', variant: 'S' });
  assert.deepEqual(splitLineItemName('Gift Card'), { product: 'Gift Card', variant: '' });
  assert.deepEqual(splitLineItemName('Tote - Canvas'), { product: 'Tote - Canvas', variant: '' });
});

test('parseSize falls back from variant to name to SKU', () => {
  assert.equal(s(parseSize({ variant: 'L / Blue' })), 'L');
  assert.equal(s(parseSize({ name: 'Linen Shirt - XS / White' })), 'XS');
  assert.equal(s(parseSize({ name: 'Linen Shirt', sku: 'LS-WHT-S' })), 'S');
  assert.equal(parseSize({ name: 'Linen Shirt', sku: 'LS-WHT' }), null);
});

test('sizes inside free text need an explicit cue', () => {
  assert.equal(s(sizeFromText('Please send a size L instead')), 'L');
  assert.equal(s(sizeFromText('exchange for an XL')), 'XL');
  assert.equal(s(sizeFromText('想换成M码')), 'M');
  assert.equal(s(sizeFromText('换L码')), 'L');
  assert.equal(sizeFromText('I loved it but it was a bit much'), null);
});

test('size comparison', () => {
  assert.equal(compareSizes(sizeFromVariant('S'), sizeFromVariant('M')), -1);
  assert.equal(compareSizes(sizeFromVariant('XL'), sizeFromVariant('L')), 1);
  assert.equal(compareSizes(sizeFromVariant('28'), sizeFromVariant('30')), -1);
  assert.equal(compareSizes(sizeFromVariant('M'), sizeFromVariant('30')), null);
  assert.equal(compareSizes(sizeFromVariant('M / Red'), sizeFromVariant('M / Blue')), 0);
});
