# 复杂排版、ICC 与静态原生格式验收

后续进展见 [原生、跨页表格与 PDF/X 验收](native-rich-pdfx-acceptance.md)。以下为前一轮快照。

日期：2026-10-17。工作区：`shuye-web`。**未发布；完整产品验收未通过。** 本文件记录本轮实做与测试，不把独立子集等同于飞翔全功能。

## 新增实现

- 自由文字流：字素边界的局部字号/字体/颜色，1–8 个不等宽栏、竖排、基础中英文换行禁则、多边形文章区和矩形避让；前后端共用行与字形位置计划。编辑、拆分与续排保留原文和样式。
- 自动续排：复制指定串接框几何，追加所需框与页面；插在原框链最后所在页之后、后续章节之前。失败不改变原工程。MCP 支持指定三类字体、dry-run 和修订号。
- 母版：页面内容槽跨母版切换保留；未串接页面可转母版；章节页码重启或连续、中文/罗马数字；必要时插入无母版空白页以实现左右起章。多个变量替换后局部样式仍保留，书名里的变量字面量不二次展开。
- 印前：LittleCMS WASM 真正执行 ICC 8/16 位转换；RGB 内嵌源 ICC、CMYK JPEG 源 ICC、透明 PNG、总墨量检查。显式 CMYK、专色与叠印保持原有语义。印刷 OutputIntent 使用上传的原始 ICC 字节。
- 多字体：TTF/CFF 子集嵌入，支持宋/黑/楷分别提供资源。CFF 子集使用 FontFile3/CIDFontType0C；禁止子集化的字体完整嵌入为 FontFile3/OpenType。缺失字体或字形拒绝输出。
- PDF/X-4 输出配置：PDF 1.6、OutputIntent、Info/XMP、文件 ID、CMYK 混合空间和页框。报告始终明确 `pdfXIndependentCertification:false`。
- 云保存：D1 响应不确定时保留 R2 文稿并核对提交结果，避免提交已成功却误删数据；提交前错误保留旧版本。未知结果可能留下未引用 R2 对象，垃圾回收另行实现。
- 原生静态检查：独立只读 FFX 解析器连续读出 18 条已证实类/版本记录；未知类型/版本不跳过。MCP 工具合计 66 个。

## 实际执行结果

| 项目 | 输入与检查 | 结果与证据 |
|---|---|---|
| 自动回归 | `node --test tests/*.test.mjs`；包含非法样式、源文守恒、几何、母版槽、页码、续排回滚、ICC 负例、字体嵌入、存储故障注入 | **113 / 113 通过**；`.sites-runtime/complex-all-tests.log` |
| 生产构建 | Sites 标准 `build-site.mjs`；实际 workerd，独立本地 D1/R2 目录 | 成功；`.sites-runtime/complex-build.log` |
| 基础 HTTP | MCP、D1/R2、过期修订拒绝、文稿校验 | `http-acceptance-1792216832484`，r2，通过 |
| 框链 HTTP | 持久化、覆盖、重复归属拒绝、历史恢复 | `composition-acceptance-1792216837029`，r3，通过 |
| 母版 HTTP | 嵌套与章节规则、循环拒绝、覆盖、恢复 | `master-acceptance-1792216837199`，r3，通过 |
| 续排 HTTP | 内容槽跨母版保留、左页空白、页数上限回滚、dry-run、恢复与重跑 | `auto-master-1792216835197`，r7，3100 字 / 5 页，通过 |
| 专色 HTTP | 非法墨量、修订不变、专色修改与恢复 | `ink-acceptance-1792216837428`，r3，通过 |
| 最终复杂 PDF HTTP | 三套真实 Fandol OTF、真实 CMYK ICC、PNG alpha、RGB/CMYK JPEG、专色、跨页文字流、竖排和梯形区 | `complex-acceptance-1792217076562`，r3，2 页，**173843 bytes**；`.sites-runtime/complex-http-result.json` 与 `complex-http-acceptance.pdf` |
| 普通 PDF HTTP | CFF 中文子集嵌入、过期修订拒绝 | `print-acceptance-1792217080988`，5370 bytes；`worker-print-acceptance.pdf` |
| PDF 独立解析 | pypdf/Pillow 检查最终文件版本、字体、ICC、XMP、ID、颜色资源和页框 | **48 项通过**；`complex-pdfx-check.json`；只是受限写入器结构检查 |
| PDF 负例 | 删除 OutputIntent、XMP、TrimBox，破坏 BleedBox，加入未校准 RGB 图像 | 5 类全部按对应规则拒绝；`complex-pdfx-negative.json` |
| PDF 独立渲染 | Ghostscript 10.07.1 渲染、人工查看；pypdf 提取中文与 Latin words | 两页通过；`complex-render-1.png`、`complex-render-2.png`；日志仅有本机 FAPI 映射缺失提示，无字形错误 |
| 独立分色 | tiffsep 的 CMYK + Book Blue 色版；红色不透明/半透明区域、60% 专色区域像素核对 | M 255 / 128、专色 153 且 CMYK 为 0；`complex-plate-check.json` 与 `complex-plates-*` |
| 连续长文 | 32000 字真实字体测量，不使用手工分页；逐段重组原文 | 33 页、896 ms、无溢出、原文相等；Node 进程 RSS 163 MB；`continuous-flow-benchmark.json`，不是生产 Worker 内存承诺 |
| 真实 FFX | 随安装包旧版 `ShellNew/newfile.ffx`，SHA256 961000261a1e3c210c009d75c7ac3ee936af7af832986b7b6425c0c9dcfd9860 | 产品解析器 18 条，停 `0x5ca0`；3142 个记录内逐字节截断拒绝，18 类边界未知类型与版本均原位停止；`ffx-acceptance.json` |
| FFX MCP | 同一样本通过本地生产 HTTP 调用 `inspect_founder_ffx` | 18 条、不可编辑标志和停止偏移正确；`ffx-http-result.json` |

上述 Worker 使用本地授权身份桩测试业务路径，**不是新线上部署验收**。首次开发/生产预览共用持久化目录时出现 D1 内部响应错误；随后隔离测试目录，生产流程通过，并补上提交前/提交后响应丢失的故障注入用例。

## 浏览器验收

使用应用浏览器真实 UI 与本机 `127.0.0.1:5173`，没有通过 DOM 注入或内部状态变量代替操作。

1. 复杂工程修改不等宽栏为 `1,2,1`，保存、刷新后保持；恢复 r3 后刷新返回 `1,1.3`，源文保持。
2. `auto-master-1792216200645`：第 2 页内容槽改为“浏览器内容槽验收”，从 m2 切换 m1，页码改中文，保存并刷新；三项保留。通过历史对话框确认恢复 r7，再刷新，返回“保留的章节标题”、m2 和小写罗马数字。
3. 将串接框高度改为 40 mm，显示 589 字溢出。键盘触发“自动续排至新页面”，页数从 5 增至 9，溢出消失并保存。另用 `auto-master-1792217257948` 复现指针点击被纸面遮挡的问题，修复窄视口的独立滚动容器后，鼠标点击成功从 5 页续排至 9 页，保存并刷新仍为 9 页，无溢出。截图 `auto-flow-browser-pointer.png`。
4. PDF 输出选择实际字体；勾选 PDF/X 而未提供 ICC 时明确拒绝。提供 ICC 后生成、下载 2 页成品。子集化修复后再次导出，实际下载文件重新用独立检查器验证，通过 40 项受限结构检查。
5. 截图：`.sites-runtime/complex-browser-export.png`；浏览器成品：`complex-browser-acceptance.pdf`。浏览器字号受系统字体影响，与导出选择字体不同，未声称同版。

## 原生格式的已知停止点

真实样本随 9.0 分发，但文件标识为旧版 5.3.1.902。18 条记录覆盖文档根、内容纸板、文章容器、参数 v9、图层/母版/页码/章节管理器及五种纸板层。参数读出 30 组、39 对字体映射；不能据此推出全部页面原点。

下一类型 `0x01006902 / Cv_DocParamterConcernedUnDo` 的序列化入口 RVA `0x10440` 跳入 `.vmp0` 的 `0x2549b2`。没有恢复其字段或长度，无法安全越过。REA 证据 `ev_1026327a523c2e5232bf62ee3948acc71f3d01ecd1d10066e36382e9eaa49a93`。研究报告在工作区 `.research/fx9-static/FFX-PARAMETER-AND-CONTAINERS.md`。

用户没有飞翔账号；原生打开、修改、保存、重开及参考 PDF 对照没有执行。安装包、模板、程序、字体、解包及反汇编产物均不在公开源码中。

## 尚未通过的完整验收门槛

- **原生兼容**：没有完整 FFX/PDML 可编辑导入与写回，18 条结构解析不是双向兼容。仍需继续恢复未知结构及建立可验证的原生往返样本。
- **复杂排版**：基础禁则不等于完整标点挤压/对位；没有完整锚定对象和任意轮廓绕排；自由框中的复杂跨页表格、注音、脚注和引用尚未全量整合。顺序流中的对应组件不能自动算作自由框支持。
- **母版与交互**：已实现的单页母版继承、内容槽与页码规则不等于飞翔所有双页主页/灌文规则。窄视口续排的纸面遮挡问题已修复并完成鼠标回归。
- **印前**：图片上限 200 万像素；无 ICC 软打样/叠印屏幕预览。未完成全 ISO 15930-7 独立验证，当前结构检查与 Ghostscript 渲染/分色不能充当合规证书。
- **总体产品**：专业图层、对象样式、EPUB 等历史矩阵缺口不因本轮新增而关闭。

因此没有达到用户要求的“所有不依赖飞翔账号的功能全部补齐”和“全部验收通过”。GitHub 与服务器均保持此前版本，未执行提交、推送或部署。

## 复现入口

- 单元/协议：`node --test tests/*.test.mjs`。
- HTTP：`scripts/http-acceptance.mjs`、`composition-http-acceptance.mjs`、`master-http-acceptance.mjs`、`auto-master-http-acceptance.mjs`、`complex-http-acceptance.mjs`、`ink-http-acceptance.mjs`、`print-http-acceptance.mjs`。仅允许 loopback；生产 Worker 本地桩需 `TEST_WORKER_DIRECT=1`。
- 独立 PDF：`python scripts/check-pdfx4.py output.pdf expected.icc`；`python scripts/check-pdfx4-negative.py output.pdf`，需要 pypdf/Pillow。
- 原生只读：`node scripts/inspect-founder-ffx.mjs file.ffx`；已知本机样本验收 `node scripts/ffx-acceptance.mjs ShellNew/newfile.ffx`。不捆绑样本。
