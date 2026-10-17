> 发布范围更新：用户随后授权先同步已完成功能，现纳入 Web 0.5.0。以下“未发布/未通过发布门槛”描述保留为当时的验收记录；未通过的功能仍未宣称完成。见 [0.5.0 发布说明](release-0.5.0.md)。

# 原生格式、跨页表格与 PDF/X 验收

日期：2026-10-17。本轮在本地源码与隔离 Worker 中完成下列增量。**整体完整版验收未通过，没有同步 GitHub 或服务器。** 前一轮记录见 [复杂排版与 ICC](complex-layout-icc-acceptance.md)。

## 原生格式

- 新增 `open_founder_pdml`、`edit_founder_pdml`。文章文字、对象几何和已存在的样式属性可以按 UID 定点修改，写回完整 XML。使用源 SHA-256 和原属性值防止陈旧修改；未知命名空间、CDATA、原引号、外部资源路径和未修改片段原样保留，不访问外部资源。
- 文本修改须保持 UTF-16、码点和字素边界分布，避免改坏尚未恢复的原生锚点索引。变长文本明确拒绝。文件级无修改往返逐字相等。
- 显式 `pageRect`、单页纸板、纯文本子集可通过 `import_founder_pdml_composition` / `export_founder_pdml_composition` 导入自由版面结构和反向写回。母版、未知样式、图片、串接及其他未支持结构拒绝转换，不静默丢弃。
- 静态证据补充：随包 `common.xslt` 第 62–63 行从 `pageRect` 取原点；`fixlayout.xslt` 第 376 行用 `(xPos-pageX-width/2)*72/25.4` 计算位置，确认中心坐标及毫米单位。没有 `pageRect` 的模板仍不能据此猜原点。
- 浏览器新增“PDML 原文编辑”：UTF-8 文件选择、文章和对象分页读取、文本/几何/样式修改、下载；修改中的并发请求拒绝，返回后再次核对源哈希。

真实样本是安装包内的旧版模板，351100 bytes，SHA-256 `b8a15cd7aa626d49b3b650192fc5879d576330dd9817e777c1b7e03b4712f202`，2 页、17 母版、131 对象、53 文章。原文无改动、文本修改、几何修改、逆操作、结构计数和未知 XML 保留均通过，证据 `.sites-runtime/pdml-roundtrip-acceptance.json`。模板不随开源代码发布。

**尚未通过：**完整 FFX 读取/写出、变长文字及原生锚点重算、完整 PDML 渲染、飞翔打开/重排/保存后的往返对照。FFX 保持 18 条连续已知记录，未知类型原位停止；没有伪造兼容文件。

## 自由框跨页表格与注释

结构文字流使用 `story.blocks` 和 `story.notes`，`story.text` 留空。与纯文字流兼容，源内容持久保存；浏览器和 PDF 共用 `rich-story.mjs` 排版计划。

- 段落局部样式、任意表格列宽比例、横纵合并、重复多行表头、跨页拆分超高行及纵向合并格。合并格中的全部文字保留，逐单元格检查不丢字、不重复。
- 表头完整排入；无法容纳的表头明确报错。普通行组尽量不拆分；超高行组按完整文字行拆分。续页边框与重复表头同时输出。
- 段落/表格中的 `[^id]` 引用解析为编号。脚注从引用所在框/栏开始，预留栏底区域；长注释跨栏/页续排，并标明编号和“续”。尾注排到流末。注释正文不再以未解析标记进入印刷文件。
- 自动续排复制框和页面，在后续章节之前插入；超页上限、无法推进等失败原子回滚。
- UI 提供单元格编辑、合并/拆分、增行增列、段落、脚注及尾注编辑。MCP 新增 `story_table_set_cell/merge/split/resize`、`story_update_paragraph`、`story_update_note`；结合既有 `upsert_story` 可整体建立/替换内容。全部修改携带修订号，支持 dry-run 和历史恢复。工作区合计 76 个 MCP 工具。
- 框过窄、表头过高等布局失败显示诊断并保留源文；PDF 输出拒绝，浏览器不会因排版异常丢失工程。

**当前边界：**要求横排矩形框，各框/栏使用相同列宽及字体度量；可用等宽多栏、不同框高和旋转框。不支持竖排/异形表格、跨框不同列宽的重排、单元格内部富样式和注音。脚注按栏底放置，每条注释只有一个源引用；注释区最多为栏高 40%。这不是所有复杂出版排版的完整实现。

## 实际验收

| 项目 | 结果 |
|---|---|
| Node 自动测试 | **126 / 126**；`.sites-runtime/rich-all-tests.log`；包含原有回归、PDML、逐单元格守恒、长脚注、12 组不同表格尺寸/合并跨度、超高首行、MCP 操作回滚 |
| 标准生产构建 | `build-site.mjs` 成功；`.sites-runtime/rich-build.log` |
| 新功能生产 HTTP | `rich-acceptance-1792218433721`，r4，19 页，178990 bytes；`.sites-runtime/rich-http-result.json` |
| 基础/框链/母版 HTTP 回归 | `http-acceptance-1792218442657` r2；`composition-acceptance-1792218442823` r3；`master-acceptance-1792218443004` r3；均通过 |
| PDML HTTP | 定点文本改写、陈旧哈希拒绝、子集导入及几何写回均通过 |
| PDML 浏览器 | 实际打开原创样本，文本“原文验收”→“修改验收”，中心 X 50→52；下载文件精确等于这两处替换；变长文本被拒绝；`native-browser-acceptance.pdml` / `native-browser-proof.png` |
| 表格浏览器 | `rich-acceptance-1792218159523`；将第 3 行第 3 列改为“浏览器修改”，保存、刷新保留；通过历史对话框恢复 r4 并再次刷新，恢复为 `0` |
| 浏览器 PDF | 真正选择 FandolSong OTF 与 CMYK ICC，生成并下载 19 页；`rich-browser-acceptance.pdf` |
| 独立内容与位置 | HTTP / 浏览器两份 PDF，逐页抽取栏底注释，30 行表格、180 段长注释、尾注及表后段落守恒；各 4122 个字形框界检查通过；6 个续注标签；`rich-content-check.json` / `rich-browser-content-check.json` |
| 独立渲染 | Ghostscript 渲染全部 19 页，检查总览和跨页注释细节；`rich-all-pages.png`、`rich-render-*.png` |
| PDF/X 子集检查 | 两份当前 PDF 各 **1611 次对象检查**通过；这是重复规则应用次数，不是 ISO 条款数；`rich-pdfx-check.json` / `rich-browser-pdfx-check.json` |
| PDF 负例 | **29 / 29** 按对应规则拒绝；纯文字 PDF 也补入原创图像资源执行图像负例；`rich-pdfx-negative.json` |

HTTP 与浏览器 PDF SHA-256 分别为 `01195c13048cfe56bcdfe24f67c5bae2d08202041b9e7a8eb962576a5aa101c8`、`fbc16bf447cdc253a051f4962d276c58f6c8b30933c21b55d98896d577491e83`。字体/ICC 来自本机测试资源，不捆绑到公开源码。Worker 使用隔离本地 D1/R2 和测试身份，不是新线上部署。

## PDF/X 发布门槛

独立检查新增递归 Form、字体程序解析、ICC 标签边界、颜色资源、透明蒙版、图形/文本栈、外部资源和主动内容等。完整范围、负例和官方资料见 [PDF/X 验证报告](pdfx-validation-acceptance.md)。

没有取得完整 ISO 15930-7 全条款实现或针对成品的独立专业引擎报告；veraPDF 不验证 PDF/X，已调查的 callas CLI 需要账号和激活。本机标准卸载记录查询也未发现 Acrobat/pdfToolbox/PitStop 条目。`--require-iso` 在子集通过时仍返回退出码 2、`releaseGatePassed:false`。不会将 Ghostscript 渲染、分色或本工具通过解释为完整 PDF/X 认证。

用户要求“逐项全部通过后再同步”。完整原生兼容与 PDF/X 门槛仍未通过，其他历史矩阵缺口也未关闭。因此本轮未提交、推送或部署，线上与 GitHub 保持此前版本。

## 复现

```powershell
node --test tests/*.test.mjs
node scripts/pdml-roundtrip-acceptance.mjs path/to/bundled-template.pdml
node scripts/rich-http-acceptance.mjs path/to/font.otf path/to/output.icc
python scripts/check-rich-acceptance.py .sites-runtime/rich-http-acceptance.pdf
python scripts/check-pdfx4.py .sites-runtime/rich-http-acceptance.pdf path/to/output.icc
python scripts/check-pdfx4-negative.py .sites-runtime/rich-http-acceptance.pdf
python scripts/check-pdfx4.py .sites-runtime/rich-http-acceptance.pdf path/to/output.icc --require-iso
```

HTTP 脚本仅允许 loopback。生产 Worker 测试设置 `TEST_ORIGIN=http://127.0.0.1:5174`、`TEST_WORKER_DIRECT=1`，须使用独立本地持久化目录。Python 检查依赖在 `scripts/requirements-validation.txt`。
