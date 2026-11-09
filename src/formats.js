// Column detection for the supported export formats, plus PII column stripping.
//
// Each file is reduced to "roles" (product, variant, sku, reason, …). Headers are
// compared in normalised form (lowercase, letters/digits only) so "Lineitem SKU",
// "lineitem_sku" and "Lineitem sku" all match.

import { parseCSV } from './csv.js';

export const ROLES = {
  product: '商品名',
  variant: '变体名（含尺码）',
  lineName: '订单行名称（商品 - 变体）',
  sku: 'SKU',
  qty: '数量',
  reason: '退货原因',
  subReason: '退货子原因',
  note: '顾客备注（只用于判断，不展示）',
  staffNote: '客服备注（只用于判断，不展示）',
  exchange: '换货目标（变体/SKU/备注）',
  outcome: '处理结果（退款/换货）',
  orderId: '订单号',
  financialStatus: '付款状态',
  refundedAmount: '退款金额',
  price: '单价',
};

export const norm = h => String(h).toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');

// Free-text columns we read for classification. They are never rendered or exported.
const ALLOWED_TEXT = new Set([
  'customerreturnnotes', 'customerexchangenotes', 'returncustomernote', 'returncomment', 'returnnote',
]);

/** True for columns that can hold buyer personal data. These are dropped at parse time. */
export function isPiiHeader(header) {
  const k = norm(header);
  if (ALLOWED_TEXT.has(k)) return false;
  if (/email|e-?mail|phone|mobile|address|street|city|zip|postal|postcode|province|country|company|ipaddress|^ip$|deviceid|paymentid|paymentreference|trackingnumber|trackingurl|giftcard|images?$|employee|firstname|lastname|fullname|birthday|邮箱|电话|手机|地址|姓名|收件人/.test(k)) return true;
  if (/^notes?$|noteattributes|^tags$/.test(k)) return true; // order-level free text / tags often carry names
  if (/name/.test(k) && !/product|lineitem|variant|item|title|tax|discount|method|terms|province|sku/.test(k)) return true;
  if (/^customer/.test(k) && !/note|reason/.test(k)) return true;
  if (/^(billing|shipping)(?!method)/.test(k)) return true;
  return false;
}

/**
 * Known formats. `signature` headers identify the format; `map` lists candidate headers per role
 * (first match wins). Sources for the header names are listed in README.md.
 */
export const FORMATS = {
  shopify_orders: {
    label: 'Shopify 订单导出（Orders → Export）',
    kind: 'orders',
    signature: ['lineitemname', 'lineitemquantity', 'financialstatus', 'refundedamount'],
    map: {
      lineName: ['Lineitem name'],
      sku: ['Lineitem SKU', 'Lineitem sku'],
      qty: ['Lineitem quantity'],
      price: ['Lineitem price'],
      orderId: ['Name', 'Id'],
      financialStatus: ['Financial Status'],
      refundedAmount: ['Refunded Amount'],
    },
  },
  shopify_returns: {
    label: 'Shopify 分析报表 · Returns（ShopifyQL FROM returns）',
    kind: 'returns',
    signature: ['returnlineitemreason', 'productvarianttitleattimeofsale', 'producttitleattimeofsale', 'returnedquantity'],
    map: {
      product: ['product_title_at_time_of_sale', 'Product title at time of sale', 'Product title'],
      variant: ['product_variant_title_at_time_of_sale', 'Product variant title at time of sale', 'Product variant title'],
      sku: ['product_variant_sku_at_time_of_sale', 'Product variant SKU at time of sale', 'Product variant SKU'],
      qty: ['returned_quantity', 'reversed_quantity', 'Returned quantity', 'Reversed quantity'],
      reason: ['return_line_item_reason', 'Return line item reason', 'Return reason'],
      note: ['return_customer_note', 'Return customer note'],
      staffNote: ['return_note', 'Return note'],
    },
  },
  aftership: {
    label: 'AfterShip Returns 导出',
    kind: 'returns',
    signature: ['rmanumber', 'returnproductsku', 'returnproducttitle', 'skureturnquantity', 'subreason', 'rmaoutcome'],
    map: {
      product: ['Return product title'],
      sku: ['Return product SKU'],
      qty: ['SKU return quantity', 'RMA return quantity'],
      reason: ['Return reason'],
      subReason: ['Sub-reason'],
      note: ['Customer return notes'],
      exchange: ['Customer exchange notes'],
      outcome: ['RMA outcome', 'Legacy RMA resolution'],
      orderId: ['Order number'],
    },
  },
  loop: {
    label: 'Loop Returns（API / 数据连接器字段）',
    kind: 'returns',
    signature: ['parentreturnreason', 'exchangevariant', 'returnreason', 'returncomment', 'outcome'],
    map: {
      product: ['title', 'product_title'],
      variant: ['variant_title', 'variant_name'],
      sku: ['sku'],
      qty: ['quantity'],
      reason: ['return_reason'],
      subReason: ['parent_return_reason'],
      note: ['return_comment'],
      exchange: ['exchange_variant', 'exchange_variant_title', 'exchange_sku'],
      outcome: ['outcome'],
      orderId: ['order_name', 'order_id'],
    },
  },
};

// Fallback guesses for unknown formats (ReturnGO, spreadsheets, other apps).
const GENERIC = {
  product: ['producttitle', 'productname', 'itemname', 'itemtitle', 'product', 'title', 'item', '商品名称', '商品'],
  variant: ['varianttitle', 'variantname', 'variant', 'option', 'size', '规格', '尺码'],
  lineName: ['lineitemname'],
  sku: ['variantsku', 'productsku', 'itemsku', 'sku'],
  qty: ['returnquantity', 'returnedquantity', 'quantity', 'qty', '数量'],
  reason: ['returnreason', 'reason', '退货原因', '原因'],
  subReason: ['subreason', 'parentreason', 'secondaryreason'],
  note: ['customernote', 'customercomment', 'comment', 'notes', '备注'],
  exchange: ['exchangevariant', 'exchangesku', 'exchangeitem', 'exchangeproduct', 'exchange', '换货'],
  outcome: ['outcome', 'resolution', 'returntype', 'returnmethod', 'type'],
  orderId: ['ordernumber', 'ordername', 'orderid', 'order'],
};

function findHeader(headers, candidates) {
  const byNorm = new Map(headers.map(h => [norm(h), h]));
  for (const c of candidates) {
    const h = byNorm.get(norm(c));
    if (h) return h;
  }
  return null;
}

function fuzzyHeader(headers, candidates, used) {
  for (const c of candidates) {
    const h = headers.find(x => !used.has(x) && norm(x) === c);
    if (h) return h;
  }
  for (const c of candidates) {
    const h = headers.find(x => !used.has(x) && norm(x).includes(c));
    if (h) return h;
  }
  return null;
}

export function detectFormat(headers) {
  const keys = new Set(headers.map(norm));
  let best = null;
  for (const [id, f] of Object.entries(FORMATS)) {
    const score = f.signature.filter(s => keys.has(s)).length;
    if (score >= 2 && (!best || score > best.score)) best = { id, score };
  }
  return best ? best.id : 'generic';
}

export function guessMapping(headers, formatId) {
  const mapping = {};
  const used = new Set();
  const f = FORMATS[formatId];
  if (f) {
    for (const [role, cands] of Object.entries(f.map)) {
      const h = findHeader(headers, cands);
      if (h) { mapping[role] = h; used.add(h); }
    }
    return mapping;
  }
  for (const [role, cands] of Object.entries(GENERIC)) {
    const h = fuzzyHeader(headers, cands, used);
    if (h) { mapping[role] = h; used.add(h); }
  }
  // An orders-like generic file has a quantity but no reason column.
  return mapping;
}

export function guessKind(formatId, mapping) {
  if (FORMATS[formatId]) return FORMATS[formatId].kind;
  return mapping.reason || mapping.exchange || mapping.outcome ? 'returns' : 'orders';
}

/**
 * Parse a CSV export and immediately drop PII columns. The returned rows never contain
 * buyer names, emails, addresses or phone numbers.
 */
export function loadFile(name, text) {
  const { headers, rows } = parseCSV(text);
  const format = detectFormat(headers);
  // Shopify's order export calls the order number "Name" (#1001). Keep it only when every
  // value really is an order number; anywhere else a bare "Name" column is treated as PII.
  const orderNumberName = format === 'shopify_orders' && headers.includes('Name')
    && rows.every(r => /^#?[A-Za-z0-9-]*\d+$/.test(r.Name || '0'));
  const pii = h => !(orderNumberName && h === 'Name') && isPiiHeader(h);
  const dropped = headers.filter(pii);
  const kept = headers.filter(h => !pii(h));
  const cleanRows = rows.map(r => {
    const o = {};
    for (const h of kept) o[h] = r[h];
    return o;
  });
  const mapping = guessMapping(kept, format);
  return {
    name,
    format,
    formatLabel: FORMATS[format]?.label || '未识别格式（已按列名猜测，请检查映射）',
    kind: guessKind(format, mapping),
    headers: kept,
    droppedColumns: dropped,
    mapping,
    rows: cleanRows,
  };
}
