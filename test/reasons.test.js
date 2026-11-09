import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyReason } from '../src/reasons.js';

const c = (...a) => classifyReason(...a).cls;

test('English small signals', () => {
  for (const t of ['Too small', 'Size was too small', 'SIZE_TOO_SMALL', 'Too tight in the shoulders',
    'runs small', 'I need to size up', 'smaller than expected', 'sleeves too short']) {
    assert.equal(c(t), 'small', t);
  }
});

test('English large signals', () => {
  for (const t of ['Too big', 'Size was too large', 'SIZE_TOO_LARGE', 'way too loose', 'baggy around the waist',
    'runs large', 'need a smaller size', 'bigger than expected', 'too long']) {
    assert.equal(c(t), 'large', t);
  }
});

test('Chinese signals', () => {
  assert.equal(c('偏小，穿不上'), 'small');
  assert.equal(c('胸围太紧'), 'small');
  assert.equal(c('想换大一码'), 'small');
  assert.equal(c('太大了'), 'large');
  assert.equal(c('腰围偏松'), 'large');
  assert.equal(c('裤长太长'), 'large');
  assert.equal(c('尺码不合适'), 'fit');
  assert.equal(c('质量不好'), 'other');
});

test('negation cancels a keyword', () => {
  assert.equal(c('Not too small, just did not like the colour'), 'other');
  assert.equal(c('不紧，就是颜色不喜欢'), 'other');
});

test('direction-less size complaints', () => {
  assert.equal(c('Wrong size'), 'fit');
  assert.equal(c('Size/Fit'), 'fit');
  assert.equal(c("Didn't fit"), 'fit');
});

test('non-size reasons', () => {
  assert.equal(c('Changed my mind'), 'other');
  assert.equal(c('Damaged or defective'), 'other');
  assert.equal(c('Not as described'), 'other');
  assert.equal(c('Colour'), 'other');
});

test('empty and Other are unknown', () => {
  assert.equal(c(''), 'unknown');
  assert.equal(c('Other'), 'unknown');
  assert.equal(c('N/A', '', null), 'unknown');
  assert.equal(c('其他'), 'unknown');
  assert.equal(c('asdf'), 'unknown');
});

test('reason + sub-reason + note are combined', () => {
  assert.equal(c('Other', '', 'it was way too tight around the chest'), 'small');
  assert.equal(c('Size/Fit', 'Too big'), 'large');
});

test('conflicting directions count as direction-less', () => {
  assert.equal(c('top too small, bottoms too big'), 'fit');
});
