# SizeFit

**Find out which sizes of which products run small or large — from the CSV exports you already have.**

SizeFit is a free, browser-only tool for apparel stores on Shopify. Drop in your Shopify order export and/or a returns export (Shopify Returns report, AfterShip Returns, Loop, or any CSV via manual column mapping). It reads exchange direction (S → M means S runs small), return reasons in English and Chinese, and return rates, then tells you for every product × size whether it runs small, runs large, fits, needs a closer look, or doesn't have enough data yet. You get a ranked list of problem products, a fit note you can paste on the product page ("Runs small — we recommend sizing up."), and size-chart change suggestions.

- Runs entirely in your browser: files are never uploaded. Buyer names, emails, addresses and phone numbers are dropped as soon as the file is read.
- No sign-up, no app install. Try it with the bundled sample data.
- Report export to HTML or PDF.
- English and Chinese interface (picked from your browser language, switchable top right). Fit notes are always English, since they're meant for your product pages.

Run locally: `npm start`, then open http://localhost:5173. Tests: `npm test`. No dependencies.

---

服装卖家上传 Shopify 的订单 / 退货导出 CSV，工具按「款式 × 尺码」判断每个码偏大、偏小还是正常，并给出：

- 问题款排行
- 每款每个尺码的结论（偏小 / 偏大 / 正常 / 待确认 / 样本不足）和依据条数
- 一条可以直接贴到商品页的英文 fit note（如 `Runs small — we recommend sizing up.`）
- 尺码表修改建议（上传尺码表时给具体数值，如 `M：Chest +3cm（98 → 101）`；没有尺码表时只给方向）

报告可以下载为独立 HTML，或用浏览器「打印 → 存为 PDF」。

界面和报告有中文、英文两套：首次打开时浏览器语言里有 `zh` 开头的就用中文，否则英文；右上角「中文 / EN」可以切换，选择记在 localStorage 里。下载的 HTML 报告用当前语言。fit note 始终是英文（给海外买家看），中文界面下旁边会附一句中文意思。文案都在 `src/i18n.js`，测试会检查两种语言的键是否一致、代码里用到的键是否都存在。

这是一个验证用的版本：纯前端单页，没有依赖，不部署、不接 Shopify App。

## 怎么跑

需要 Node.js 18+（只用来起一个静态文件服务和跑测试，没有 npm 依赖）。

```bash
npm start          # 打开 http://localhost:5173
```

页面里点「试试样例」可以直接用 `fixtures/` 里的样例数据。

```bash
npm test           # 单元测试 + 端到端测试（样例 → 报告 → 检查结论和个人信息）
npm run fixtures   # 重新生成 fixtures/ 下的样例 CSV（固定随机种子，结果不变）

# 命令行直接出报告
node scripts/cli-report.js --lang en --chart fixtures/size_chart.csv --out report.html \
  fixtures/shopify_orders_export.csv fixtures/loop_returns.csv
```

### 发布到 GitHub Pages

仓库根目录就是静态站：Pages 选 `master` 分支、`/`（root）即可，`serve.js` 只是本地用的。页面里的路径全是相对路径（`src/`、`fixtures/`），在 `https://<用户名>.github.io/sizefit/` 这样的子路径下也能用。根目录的 `.nojekyll` 让 Pages 原样发布文件。

### 配置（`src/config.js`）

| 配置 | 作用 | 留空时 |
|---|---|---|
| `goatcounterCode` | GoatCounter 站点代码（`xxx` 对应 `https://xxx.goatcounter.com`）。无 cookie 的使用统计 | 不加载任何统计脚本 |
| `waitlistUrl` | 登记意向的外部表单链接（如 Tally，需 `https://` 开头） | 报告下方的「想每月自动收到这份报告？」和「留个邮箱，有进展通知我」按钮隐藏 |

开了统计后会记录这些事件（只有事件名，不含文件名和文件内容）：页面打开（GoatCounter 自带的页面浏览）、`upload`、`format/<格式>`、`rows/<50|50-500|500+>`（每个文件的行数分桶）、`report`、`export/html`、`export/pdf`、`sample/<样例名>`、`waitlist`。开启后页面顶部的隐私说明会自动加一句统计说明。

## 支持的导出格式

按列名自动识别（列名比较时忽略大小写、空格和符号）。识别不出时按常见列名猜，并在页面上展开「列映射」让用户手动指定。

| 格式 | 用途 | 关键列 | 列名来源 |
|---|---|---|---|
| Shopify 订单导出（Orders → Export） | 销量（分母）；没有退货文件时从退款状态推断退货 | `Name`, `Lineitem name`, `Lineitem SKU`, `Lineitem quantity`, `Lineitem price`, `Financial Status`, `Refunded Amount` | Shopify 帮助中心 *Exporting orders* 的列表 |
| Shopify 分析报表 · Returns（ShopifyQL `FROM returns`） | 退货 + 原因 | `product_title_at_time_of_sale`, `product_variant_title_at_time_of_sale`, `product_variant_sku_at_time_of_sale`, `return_line_item_reason`, `returned_quantity`（也认 `reversed_quantity` 和对应的英文显示名） | shopify.dev ShopifyQL `returns` schema |
| AfterShip Returns 导出 | 退货 + 原因 + 子原因 + 换货备注 | `Return product title`, `Return product SKU`, `SKU return quantity`, `Return reason`, `Sub-reason`, `Customer return notes`, `Customer exchange notes`, `RMA outcome` | AfterShip 帮助中心 *Guide to export returns data* |
| Loop Returns | 退货 + 原因 + 换货目标 | `title`, `sku`, `return_reason`, `parent_return_reason`, `return_comment`, `outcome`, `exchange_variant` | Loop 没有官方 CSV 导出（官方 FAQ 建议用 API 自己导）；列名取自 Loop 退货行项目的数据字段（Fivetran 等连接器的 schema） |
| 其他（ReturnGO、自制表格等） | 自动猜列 + 手动映射 | 商品 / 变体 / SKU / 数量 / 原因 / 换货 等 | ReturnGO 的 RMA 导出列名没有公开文档，只能走手动映射 |

可以一次上传多份：订单导出 + 一份退货导出是最好的组合（订单给销量，退货给原因和换货方向）。同时有退货文件时，订单里的退款不再计为退货，避免重复计数。

### 尺码识别

从变体名、订单行名称（`Classic Tee - M / Black`）、SKU 里依次找尺码：

- 字母码：XXS、XS、S、M、L、XL、XXL/2XL/2X、3XL…5XL，以及 Small / Medium / Extra Large / X-Small 等写法
- 数字码：0–60，可带 .5，可带 US/UK/EU/W 前缀（`28`、`32W 30L`、`EU 38`、`7.5`）
- 组合写法：`M / Red`、`Red / M`、`Size: L`、`尺码: M / 黑色`
- SKU：只看最后两段，数字只认最后一段（避免把款号 `1023` 当尺码）
- `One Size` / `OS` / `均码` 识别后排除，不参与判断
- 字母码和数字码分开比较大小

### 退货原因分类

原因、子原因、顾客备注、客服备注合在一起判断，中英文都覆盖：

- 偏小：too small, too tight, tight, snug, runs small, size up, smaller than expected, too short, `SIZE_TOO_SMALL`；偏小、太小、太紧、勒、太短、穿不上、换大一码…
- 偏大：too big/large, loose, baggy, runs large, size down, too long；偏大、太大、太松、太肥、太长、换小一码…
- 尺码不明：wrong size, didn't fit, Size/Fit；尺码不合适、不合身
- 非尺码：changed mind, damaged, defective, colour, not as described；质量、颜色、色差、款式…
- 未知：空、Other、N/A、其他

否定词（not too small、不紧）会抵消关键词。同时出现偏小和偏大的算「尺码不明」。

## 判断规则

信号从强到弱：

1. **换货方向**：S 换成 M → S 偏小；L 换成 M → L 偏大。同码换色不算。换货和文字原因冲突时以换货为准。
2. **退货原因文字**：上面的偏小 / 偏大关键词。
3. **只有退货率**：没有原因、只是退得多 → 最多给「待确认」，不给方向。

每个尺码的结论（阈值在 `src/analyze.js` 的 `RULES` 里）：

| 结论 | 条件 | 理由 |
|---|---|---|
| 偏小 / 偏大 | 有方向的反馈（换货 + 原因）≥ **5 件**，且多数方向占比的 Wilson 下界（z = 1.28，约 90% 单侧置信）> 50% | 5 件是小店一个季度单个尺码能攒到的量级；配合 Wilson 下界，5 件里要 ≥ 4 件同向、8 件里要 ≥ 6 件同向才下结论，3:2 这种不算 |
| 正常（有销量） | 售出 ≥ **30 件**，有方向的反馈 < 销量的 **5%** | 少于 30 件时，退货率随便抖一两件就变很多 |
| 正常（无销量） | ≥ **10 件**有原因的退货，其中尺码相关 < **20%** | 只有退货记录时，只能看「退的原因里尺码占多少」；全是空原因的不算正常 |
| 正常（噪音） | 有销量时，方向反馈不到销量的 **2%** | 卖了 1000 件有 6 件说小，不值得改尺码表 |
| 待确认 | 偏小偏大的反馈都有、方向不一致；或 ≥ **3 件**「尺码不合适」但没说方向；或退货率 ≥ 该款平均的 **1.5 倍** 且高出 **5 个百分点**（需 ≥ 5 件退货、≥ 20 件售出） | 有问题的迹象，但不足以说偏大还是偏小，需要卖家看一下实物或问顾客 |
| 样本不足 | 其余情况 | 宁可不说，也不给错误结论；报告里会写「倾向偏小，还差 N 件」 |

fit note：判定偏差的尺码占已判定尺码的一半以上时写 `Runs small/large — we recommend sizing up/down.`，只有个别尺码时写 `Size XL runs large — if you're between sizes…`，偏大偏小都有时提示看尺码表；有「待确认」的尺码时不写 `True to size`。

### 「先改这几个」和金额估算

报告最上面列出最该先改的 1–3 个「款 × 尺码」：先列判定偏小 / 偏大的，再列待确认的，各自按尺码相关退货件数排序（`estimateFixes`，阈值在 `RULES`）。

- 金额 ≈ 尺码相关退货件数 × 单价 × (30.44 ÷ 数据覆盖天数)，单价优先用该尺码的平均价，没有就用该款平均价。这是「涉及的退货金额」估算，不是实际损失。
- 单价来自订单导出的 `Lineitem price`、AfterShip 的 `Product price`、Loop 的 `price`；日期来自 `Created at`、`Request time`、`returned_at` 等；币种来自 `Currency` 列。
- 数据覆盖不到 14 天、或没有日期时，不折算成每月，只给总件数；没有单价时只给件数/月，不给金额。

首屏示例卡片里的数字来自「订单 + Loop」样例的真实分析结果（`src/hero.js`），有测试保证两者一致。

尺码表建议：把该围度调整「到相邻尺码差值的一半」（约半个码，四舍五入到 0.5），比如 M 胸围 98、L 胸围 104，M 偏小 → 建议 +3cm。尺码表 CSV 格式见 `fixtures/size_chart.csv`（`Product, Size, Chest (cm), …`，Product 列可省略）。

## 隐私

- 所有处理都在浏览器里完成，文件不上传；页面除了加载自带样例、以及配置了 GoatCounter 时发送匿名事件名之外，没有任何网络请求。
- 读取 CSV 后立即丢掉个人信息列：姓名、邮箱、电话、地址/街道/城市/邮编/省/国家、公司、客户列、订单备注、标签、物流单号、图片、设备号、支付号等（规则见 `src/formats.js` 的 `isPiiHeader`）。只有 Shopify 订单导出里的 `Name`（订单号 `#1001`）在确认全是订单号时保留。
- 顾客 / 客服的退货备注只在内存里用于分类，不出现在报告和导出里。
- 报告里只有商品名、尺码和计数。端到端测试会把样例里每个个人信息值逐个在报告 HTML 里搜一遍，确保没有泄漏。

## 样例数据（fixtures/）

由 `scripts/make-fixtures.js` 生成，人名、邮箱（example.com）、电话（555-01xx）、地址全是假的。埋了已知的尺码问题：Classic Crew Tee 的 XS–L 偏小、牛仔裤 28/30 偏大、开衫只有 XL 偏大、连衣裙正常、卫衣量太少。

| 文件 | 说明 |
|---|---|
| `shopify_orders_export.csv` | Shopify 订单导出，官方 71 列格式，1400 单 |
| `aftership_returns_export.csv` | AfterShip Returns 导出，450 条，带原因 / 子原因 / 中英文备注 / 换货备注 |
| `loop_returns.csv` | Loop 退货行项目字段，329 条，带 `exchange_variant` |
| `dirty_returns.csv` | 未知工具导出（列名不标准、BOM + CRLF），原因大多是 Other 或空着，尺码写法混乱，部分没尺码 |
| `size_chart.csv` | 尺码表样例 |

当前样例的结果：AfterShip 样例 63.5%、订单 + Loop 样例 62.5% 的退货能归到具体偏大/偏小；只有订单导出时只能给「待确认」；脏数据样例不下方向结论。

## 已知局限

- **只有 Shopify 订单导出时给不出方向**：订单导出没有退货原因，退款只到订单级别。部分退款订单只有在退款金额正好等于某一行金额时才能对上是哪一件，对不上的跳过；退款也不完全等于退货。
- **Loop / ReturnGO 的列名没有官方 CSV 规范**：Loop 的列名取自其数据字段，`exchange_variant` 实际值的格式（变体名还是 ID）没有真实样本验证，如果是 ID 就识别不出换货方向；ReturnGO 只能手动映射。真实导出文件拿到后需要再核对一遍。
- **Shopify Returns 报表**：按 ShopifyQL 字段名识别，后台导出的显示列名可能略有不同（已兼容常见写法），需要真实文件确认。
- AfterShip 导出没有换货目标变体，换货方向只能从「Customer exchange notes」里的文字（`size L`、`换成M码`）提取。
- 商品按商品名归并，不同文件里同一商品名字不一致（比如一个带颜色一个不带）会被当成两个款。
- 原因分类是关键词规则，不是模型；口语化、拼写错误、其他语言会被归为「未知」。`loose`、`short` 这类词在描述版型时也会被算进去。
- 每个尺码独立判断，没有用相邻尺码互相借力；小店数据量少时大部分尺码会是「样本不足」，这是有意的。
- 尺码表建议统一按「半个码」给，没有区分围度和长度、没有考虑面料弹性。
- 只支持 CSV（不支持 xlsx）。退货原因分类只认中英文关键词。
- 「打印 / 存为 PDF」依赖浏览器打印，排版在 Chrome 上检查过。

## 目录

```
index.html          单页界面
src/csv.js          CSV 解析
src/sizes.js        尺码识别
src/reasons.js      退货原因分类
src/formats.js      格式识别、列映射、丢弃个人信息列
src/analyze.js      汇总和判断规则、fit note、尺码表建议
src/report.js       报告 HTML
src/app.js          浏览器交互
src/hero.js         首屏示例卡片的数据（来自样例分析）
src/config.js       统计代码、登记意向表单链接（留空即关闭）
src/i18n.js         全部界面和报告文案（中文 / 英文）、语言检测和切换
src/track.js        GoatCounter 事件
try/posts.md        推广帖草稿
serve.js            本地静态服务
scripts/            样例生成、命令行报告
test/               单元测试和端到端测试
fixtures/           样例 CSV
```
