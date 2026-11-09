// The example conclusion shown in the page hero. These numbers come from running the
// "orders + Loop" sample (fixtures/shopify_orders_export.csv + loop_returns.csv); a test keeps
// them in sync with the analysis so the hero never shows a made-up result.
export const HERO_EXAMPLE = {
  sample: ['shopify_orders_export.csv', 'loop_returns.csv'],
  product: 'Ribbed Knit Cardigan',
  size: 'XL',
  verdict: 'large',
  returns: 39,
  n: 32,   // returns that say too large (exchanges + reasons)
  ex: 24,  // of which: exchanged for a smaller size
  amountPerMonth: 616,
  currency: 'USD',
  fitNote: "Size XL runs large — if you're between sizes, we recommend sizing down.",
};
