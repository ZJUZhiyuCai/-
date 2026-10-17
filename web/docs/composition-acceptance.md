> 后续飞翔 9 安装包研究与新增颜色能力见 [增量验收](fx9-research-acceptance.md)。下文保留该阶段实际记录，不代表最新功能状态。

后续增量与当前状态见 [复杂排版与 ICC 验收](complex-layout-icc-acceptance.md)。本文保留该阶段的测试记录。

# 自由版面与印前输出验收（未发布）

执行：2026-10-16 至 2026-10-17，Windows / Node 24.15 / Codex 内置浏览器。起始源码 a32a4e198b1e1a054c6cece04aabd3ad01f2a04f，本报告对应其后的未提交工作区变更。

用户要求全部逐项通过后才更新网站及 GitHub。本轮**未发布、未推送**，不签署“完整版/飞翔全功能对等”结论。

## 实际通过的用例

| 范围 | 操作与实测结果 | 证据 |
|---|---|---|
| 自由框与串接 | 三框跨两页；首框高度 30 → 60 mm，容纳文本由 80 → 160 字符；三个框拼接精确等于 450 字符原文 | 浏览器工程 composition-acceptance-1792166111116；composition.test.mjs |
| 框坐标 | 在 1280 × 900 视口真实拖动首框；x/y 从 20/35 → 29.92/41.61 mm，属性面板一致；撤销恢复 | 浏览器交互 |
| 断开与撤销 | 断开 f1 后该框为空，原文留在原文字流并重排；撤销后首框恢复 160 字符 | 浏览器键盘操作；自动测试 |
| 母版 | 两页继承 mh，{page} 生成 1/2；第二页覆盖为“第二页局部覆盖验收”，将母版改成“母版已更新 · {page}”，第一页更新、第二页覆盖保留 | 浏览器观察、保存并重开；pageObjects 单测 |
| 版本恢复 | 原学术工程 r4 → 恢复 r1 → 刷新，页眉和正文保持恢复结果；取消恢复 r4 不改变内容 | book-4573b917-df09-4de1-bf69-dc9a64e434e7 |
| 嵌套母版与章节 | 四页按首页/偶数/奇数/偶数母版分配；浏览器改章节名更新四页，奇数页改为三级继承并覆盖；保存 r4 重开保持；循环继承拒绝并还原控件；恢复 r3 产生 r5，刷新保持恢复结果 | master-acceptance-1792168772703；master-http-acceptance.mjs |
| 新章节 | 浏览器从第 3 页创建第二章，指定首页/奇偶页母版，得到章节页码 1/2 与全书页码 3/4；删除章节起始页被拒绝；保存 r6 重开保持，页面选择跳转避开固定工具条 | 同上浏览器工程；master-browser-acceptance.png |
| 母版 PDF | MCP 导出 4 页，独立 pypdf 提取文字确认首页、奇偶页和章节变量均正确 | .sites-runtime/master-acceptance.pdf |
| v3 恢复 | 自由版面 r4 → 恢复 r3，首框回到 80 字符、两页旧母版；刷新一致；再恢复 r4，160 字符和局部覆盖均恢复 | 同一自由版面浏览器工程 |
| 云存储与 MCP | v3 完整 D1/R2 往返、母版覆盖、重复框归属拒绝且修订不变、历史恢复；本地生产 Worker 再测通过 | scripts/composition-http-acceptance.mjs |
| PDF 浏览器链路 | 选择本机 FandolSong-Regular.otf → 生成 → 下载；两页中文、母版及覆盖、嵌入字体、3 mm 出血与裁切标记 | .sites-runtime/composition-browser.pdf、composition-print-1/2.png |
| PDF 独立检查 | pypdf 提取中文正确；Poppler 渲染两页无字体警告，人工查看渲染图；MediaBox 203×278、TrimBox 185×260、BleedBox 191×266 mm | .sites-runtime/composition-browser.pdf |
| PDF 生产构建 | 本地 workerd HTTP 导出真实 4.9 MB 中文字体，成品 3,963,423 bytes；过期修订拒绝 | scripts/print-http-acceptance.mjs；worker-print-acceptance.pdf |
| 图片框 | 浏览器上传原创 1000×500 测试图，y=120 mm、旋转 15°；保存、重开、导出正常；独立读取 PDF XObject 仍为 1000×500，渲染核对旋转与比例 | composition-with-image.pdf、composition-image-print.png |

本地 Worker 测试仅在 127.0.0.1 使用 `TEST_WORKER_DIRECT=1` 模拟 Sites 网关注入身份。线上 OAuth、网关和生产内存/CPU 配额尚未覆盖；不以该测试宣称线上认证通过。网站没有改成信任请求体身份或放开匿名访问。

## 自动化与构建

`node --test tests/*.test.mjs`：79 项通过，0 失败、0 跳过。包含字素边界、跨框文字守恒、多文字流独立、框/页删除保留文字、母版覆盖与恢复、嵌套/循环/章节规则/显式页面覆盖、页面顺序与框链独立、锁定对象、原子回滚；PDF 嵌入字体、页框、溢出/缺字/低 DPI 拒绝、骑马订页序覆盖。

图片工程暴露了导出前使用 JSON 字符串比较的错误：服务端 schema 重排属性后，已保存文稿被误判为有未保存修改。现改为对象键排序的语义指纹，数组顺序仍保留；回归覆盖保存状态及实际内容变化。修复后浏览器重开并成功导出图片工程。

Sites 标准 `scripts/build-site.mjs` 最终本地生产构建成功；在 5174 的生产 workerd 再跑串接及嵌套母版 HTTP 验收均通过。嵌套母版 Worker 工程 master-acceptance-1792169401240，四页中文 PDF 独立提取正确，第 3 页 Poppler 渲染无字体警告。PDF 的初始实现有真实 CFF 错误，已修复并回归：fontkit 的 `font.cff` 不存在导致 pdf-lib 将 CFF 描述为 TrueType；现在完整嵌入 OpenType/CFF、显式 FontFile3 / OpenType / CIDFontType0，TrueType 使用子集嵌入。独立渲染后的最终文件已替换错误中间产物。

## 仍未通过的门槛

| 项目 | 状态与缺口 |
|---|---|
| W03 完整自由图文排版 | 已通过矩形横排纯文本串接、图片/色块几何基础；富文本串接、异形区、完整中文禁则、框内表格/公式未完成 |
| W05 完整母版系统 | 嵌套母版、子母版/页面覆盖、章节首页/奇偶页自动分配及变量均有独立验收；没有飞翔运行对照，尚未签署完整对等结论 |
| W19 飞翔原生双向兼容 | 阻塞：用户无飞翔安装；公开资料确认 .ffx/.ffxb/.ftpx/.fxpkg 和 PDML/XML，但没有取得真实样本、schema 或合法运行对照环境。识别扩展名与拒绝未知格式不算兼容 |
| W20 专业印前 | 已实现 RGB 矢量 PDF、嵌字、页框、裁切、基础骑马订；尚无 ICC 转换、PDF/X 独立预检、专色、叠印和印厂输出条件；不允许标记全项通过 |

原生信息依据：[官方 8.0 手册](https://www.founderfx.cn/resources/support/方正飞翔8.0印刷版说明书.pdf)，PDF 第 73 页说明 PDML/XML 途径。官方模板需登录及积分，未购买或绕过。研究资料不随开源发布；进一步验收至少需要合法保存的文字、串接、母版、图片/表格/公式的原生工程、另存 XML/PDML 与对应 PDF，以及重开对照环境。

PDF/X 的输出意图必须对应实际印刷条件；仅添加标记不是合规。当前 Worker 不运行本机 Ghostscript/XeLaTeX，且没有本项目已授权可部署的原生印前服务器配置。可继续实现云端原生作业服务或经过验证的 WASM 色彩流水线，但这项工作本轮未完成，不以服务器不存在为由标记功能完成。

## 复现

1. Node 24：`npm ci` → `npm test` → `npm run build`。
2. 初始化本地 D1 后 `npm run dev`，运行 `node scripts/composition-http-acceptance.mjs`，打开输出 URL。
3. “自由版面”中选择框改尺寸、文字流和母版；保存后从“版本”恢复，刷新核对。
4. 运行 `node scripts/print-http-acceptance.mjs <合法可嵌入字体路径>`；浏览器另从“导出排版 PDF”选择字体生成。
5. 运行 `node scripts/master-http-acceptance.mjs <合法可嵌入字体路径>` 验证嵌套母版、章节规则与历史恢复。
6. 使用独立 PDF 阅读器/Poppler 渲染和 pypdf 检查文字与页框。中文测试字体不随仓库分发。
