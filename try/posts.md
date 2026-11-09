# 推广帖草稿

链接：工具 https://ps1314.github.io/sizefit/ ，仓库 https://github.com/ps1314/sizefit 。私信模板里 `{{…}}` 是每封要手动替换的内容。

发之前注意：

- 界面中英双语，按浏览器语言自动切换，右上角可以手动切。
- 各平台都不欢迎纯广告。帖子主体是「尺码退货这件事怎么查」的经验分享，工具只作为顺带的一句；有人问再在评论里给链接更稳。
- 发帖前再看一遍各社区当前的自我推广规则（r/shopify 对自推广管得严，有专门的推广帖/周帖时优先发那里）。
- 不要编造数据或用户评价；下面的数字都来自工具自带的样例数据，发的时候说明是样例。

---

## 1. r/shopify

**标题：** How I'd figure out which sizes are causing your apparel returns (without another app)

**正文：**

If you sell clothing, a big chunk of your returns are probably size-related — but Shopify's returns reports mostly tell you *how many* came back, not *which size of which product runs small or large*.

A process that gets you to a per-size answer:

1. **Exchanges are the strongest signal.** If a customer swaps an S for an M, that S runs small. If they swap L for M, the L runs large. Most returns apps (Loop, AfterShip, etc.) record the exchange variant — export it.
2. **Return reason text is second.** "Too small", "tight in the shoulders", "baggy", "too long" — group these by product *and* size, not just by product. A tee can be fine in XL and badly small in S/M.
3. **High return rate alone isn't enough.** If a size has lots of returns but no reasons, treat it as "check this", not "runs small". Look at the actual garment or ask a few customers.
4. **Don't conclude from 2–3 returns.** I wait for at least ~5 returns that say small or large for a given size, and want most of them to point the same way.
5. **Then fix the page:** a short fit note ("Runs small — we recommend sizing up.") on the product page, and adjust the size chart by about half a size for the affected measurements.

Doing this in spreadsheets is tedious, so I put together a free browser-only tool that does the grouping from the CSV exports (Shopify orders export + a returns export). Nothing is uploaded, buyer names/emails/addresses are dropped on load. Happy to share the link if anyone wants it.

How are you all handling size-related returns? Fit notes, size quizzes, something else?

> 评论里有人要链接时回复：Here it is: https://ps1314.github.io/sizefit/ — there's sample data if you just want to see the report. Feedback welcome, especially on export formats it doesn't read correctly.

---

## 2. Shopify Community（Discussions 板块，选 Store Operations / Analytics 类）

**标题：** Finding which product sizes run small or large from your returns export

**正文：**

Sharing a process for apparel stores that want to cut size-related returns.

**The question to answer:** for each product, which *specific sizes* run small or large? "Returns by product" isn't enough — a product can be fine in most sizes and off in one or two.

**Data you need:**
- Orders export (Orders → Export) for units sold per variant.
- A returns export with reasons and, ideally, exchange variants (Shopify Returns analytics report, or your returns app's export).

**How to read it:**
- Exchanged to a bigger size → original size runs small; to a smaller size → runs large.
- Reason text: "too small / tight / short" vs. "too big / loose / long".
- Only call a direction once you have roughly 5+ returns per size pointing the same way. Below that, it's noise.
- Lots of returns but no reasons → flag it to check, don't guess the direction.

**What to change:** add a fit note on the product page and adjust the size chart by about half a size on the affected measurements (e.g. if M chest is 98 cm and L is 104 cm, and M runs small, move M to ~101 cm).

If it helps, I made a free tool that does this from the CSV exports, entirely in your browser (no upload, no app install, customer personal data is discarded on load): https://ps1314.github.io/sizefit/

Curious how other apparel merchants handle this.

---

## 3. Indie Hackers

**标题：** Validating a tiny tool: "which sizes run small?" for Shopify apparel stores

**正文：**

I'm testing a narrow idea before building anything bigger.

**The problem:** apparel stores lose a lot to size-related returns. Return analytics are everywhere now (Shopify's own reports, several cheap apps), but they stop at "returns by reason / by product". What merchants actually need to act on is: *which size of which product runs small or large, and what do I change on the product page?*

**What I built:** a single static page, no backend. You drop in your Shopify orders CSV and a returns CSV (Shopify Returns report, AfterShip, Loop, or anything with manual column mapping). It:

- uses exchange direction (S → M = S runs small) as the strongest signal, then reason text (English + Chinese), then return rate
- refuses to conclude when the sample is small (needs ~5 directional returns per size and a clear majority)
- outputs a ranked list of problem products, a paste-ready fit note, and size-chart suggestions ("M chest +3 cm")
- drops all customer PII columns on load; nothing leaves the browser

**The validation bar I set:** talk to 10 apparel stores. Pass if at least half of their returns can be attributed to a specific size issue, and at least 2 say they'd pay for a monthly automated version. If it passes, I build the Shopify app; if not, I drop it.

There's a "keep me posted" button under the report for a possible monthly automated version — the tool is free and that button only measures interest.

Link: https://ps1314.github.io/sizefit/ (sample data included). Would love feedback on the validation plan itself — is "2 of 10 say they'd pay" a meaningful signal, or should I ask for a pre-payment?

---

## 4. 小红书（中文）

**标题：** 服装独立站退货多？先查清是哪个码出了问题

**正文：**

做服装独立站，退货里一大半跟尺码有关 👗📦
但后台的退货报表只告诉你「退了多少」，不告诉你「哪一款的哪个码偏大还是偏小」。

分享一个查法 👇

1️⃣ 看换货方向：S 换成 M → S 偏小；L 换成 M → L 偏大，这是最准的信号
2️⃣ 看退货原因：too small / tight / 偏小 vs too big / loose / 偏大，要按「款 × 尺码」分开看
3️⃣ 只有退货率高、没写原因的，先别急着改，标成「待确认」，去看实物或问几个顾客
4️⃣ 样本太少（一个码就两三件）别下结论
5️⃣ 确认后：商品页加一句 fit note（比如 Runs small — we recommend sizing up），尺码表对应围度调大约半个码

自己做了个免费小工具，把 Shopify 的订单导出和退货导出（AfterShip、Loop 都行）拖进去就能出报告，全程在浏览器本地算，不上传文件，买家姓名邮箱地址会直接丢掉 🔒

想试的姐妹评论区扣 1，我发链接～

#独立站 #Shopify #服装电商 #跨境电商 #退货率 #独立站运营

> 备注：小红书站外链接容易限流，正文不放链接，评论或私信给 https://ps1314.github.io/sizefit/。

---

## 5. 冷启动私信模板（英文，发给服装独立站）

**Subject：** Which sizes of {{PRODUCT_NAME}} are getting returned?

Hi {{FIRST_NAME_OR_TEAM}},

I came across {{STORE_NAME}} while looking at independent apparel brands on Shopify — {{ONE_GENUINE_DETAIL, e.g. "the linen pieces look great"}}.

I'm working on a small free tool for one specific problem: figuring out which sizes of which products run small or large, using the return/exchange data stores already have. It reads your Shopify orders export and a returns export (Shopify, AfterShip, Loop…), runs entirely in the browser (nothing is uploaded, customer details are discarded), and gives you a per-size verdict, a fit note for the product page, and size-chart suggestions.

I'm looking for about 10 apparel stores to try it and tell me honestly whether the output is useful. It takes about 5 minutes: https://ps1314.github.io/sizefit/ (there's sample data if you'd rather see a report first).

If you try it, I'd love two answers:
1. Did it point at a size problem you didn't already know about?
2. Would you want a version that connects to your store and sends this report every month? (It's free — I'm not selling anything.)

Thanks either way,
{{SENDER_NAME}}

> 备注：每封都改 `{{ONE_GENUINE_DETAIL}}`，不要群发同一段；优先找已经在商品页写了尺码说明、或在用 Loop / AfterShip 的店（说明他们在意退货）。
