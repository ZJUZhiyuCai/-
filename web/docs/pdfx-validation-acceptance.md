> 发布范围更新：用户随后授权先同步已完成功能，现纳入 Web 0.5.0。以下“未发布/未通过发布门槛”描述保留为当时的验收记录；未通过的功能仍未宣称完成。见 [0.5.0 发布说明](release-0.5.0.md)。

# PDF/X-4 独立验证进展（2026-10-17）

本轮新增的是独立、严格的书页输出子集检查器。它没有覆盖 ISO 15930-7:2010 的全部条款，不能签发 PDF/X 认证。当前发布门槛仍未通过，不能据此宣布完整 PDF/X 合规。

## 可复现结果

环境：Python 3.13、pypdf 6.9.1、Pillow 12.2.0、fonttools 4.60.1；依赖见 `scripts/requirements-validation.txt`。

| 实际文件 | SHA-256 | 检查结果 |
|---|---|---|
| `.sites-runtime/complex-http-acceptance.pdf` | `24a2eaba51a372b5a5786220e741493a82241d9ec7538ca178296466672edbc9` | 354 次检查通过 |
| `.sites-runtime/complex-browser-acceptance.pdf` | `1bcc1b9bda2a99edcb284bf4ef84410988938ba272ee8e040b475e9bc4a66703` | 302 次检查通过 |

这些次数包含同一规则对不同对象的重复检查，不等于 354 / 302 条 ISO 标准条款。两份 PDF 都与指定 `default_cmyk.icc` 的完整字节散列一致。报告分别保存在 `.sites-runtime/pdfx-v2-http.json` 和 `pdfx-v2-browser.json`。

29 个单独构造的负例全部被预期规则拒绝；测试先检查未变异 PDF，通过后才执行负例。不是只断言“进程失败”：每个结果必须包含该变异应触发的规则。报告在 `.sites-runtime/pdfx-v2-negative.json`。

负例覆盖缺失输出意图、缺失/错误 XMP、缺失/双重 TrimBox/ArtBox、越界 BleedBox、过小 CropBox、倒置 TrimBox、RGB 图像、伪 DefaultRGB、非法图像位深、错误透明蒙版、缺失/损坏字体、嵌套 Form 中的 RGB 操作、嵌套 JavaScript、外部流、OPI 引用、ICC 标签越界、ICC 通道不一致、PDF 1.7 目录/页面特性、图形栈下溢、未定义资源、文本对象不闭合、透明度越界、传递函数、可选内容和加密。

## 新的检查范围

- 递归遍历 PDF 对象图，检查嵌套的活动对象和外部依赖；不会请求 PDF 内的 URL 或文件路径。
- 递归检查 Form XObject 的内容流和资源，避免只检查顶层页面而漏掉 RGB 操作。
- ICC 声明长度、版本、PCS、通道、标签表范围；Pillow/LittleCMS 实际打开。
- fontTools 解析嵌入的 CFF / TTF / OpenType，检查 PDF 字体包装是否对应；这不证明所有字符程序和 CID 映射正确。
- CropBox 包含关系、图形和文本对象的开闭、引用资源存在性、图像位深和透明蒙版、透明度范围。
- 本项目没有验证的模式（例如 Pattern、Shading、可选内容、非 Normal 混合）以 `_POLICY` 错误拒绝。它们不一定违反 PDF/X-4，只是超出本工具验证范围；不可将该工具用于给任意第三方 PDF 判定 ISO 不合规。
- 解析器或结构异常输出 JSON 失败结果，不再只产生 Python 堆栈。此脚本面向受控验收产物；64 MiB 输入限制不构成完整恶意 PDF 解压炸弹防护，不能直接作为公开上传服务。

运行：

```powershell
python scripts/check-pdfx4.py output.pdf output.icc
python scripts/check-pdfx4-negative.py .sites-runtime/complex-http-acceptance.pdf
python scripts/check-pdfx4.py output.pdf output.icc --require-iso
```

退出码：0 表示子集检查通过；1 表示检查失败；2 表示子集通过但完整 ISO 门槛未达到。`--require-iso` 已测试以 2 退出。报告始终明确 `isoConformanceValidated: false`、`releaseGatePassed: false`，并绑定输入 PDF SHA-256。没有外部验证报告时不会将结构通过升级为认证。

## 为什么还不能称完整验证

未取得完整标准文本并逐条实现、对照测试全部强制条件。本轮无法给出已验证的全部条款号，也不伪造条款编号。以下领域仍未完整验证：PDF 1.6 语法和操作语义；所有字形程序、CID/CMap、宽度对应关系；完整 XMP/RDF 类型及语义；ICC 数值正确性及印刷条件适用性；透明混合、叠印、可选内容、DeviceN/专色的一致性；完整 ISO 15930-7:2010 要求及针对当前文件的专业预检报告。

本次增量没有在现有两份 PDF 中发现必然不合规的 writer 缺陷；“未发现”不意味着通过全部标准。

## 外部引擎调查与可执行接入路径

PDF Association 明确说明 PDF/X-4 基于 PDF 1.6，支持透明度、图层及 OpenType，并要求嵌入输出 ICC；这些事实支持检查方向，不能替代标准全部规范。[PDF Association](https://pdfa.org/technical-side-and-requirements-of-pdfx/)

veraPDF 官方文档列出的验证标准是 PDF/A、PDF/UA 和 WTPDF，没有 PDF/X。不能把一次 veraPDF 成功结果当作 PDF/X 证据。[veraPDF Validation](https://docs.verapdf.org/validation/)

callas pdfToolbox 支持 PDF/X 预检；CLI 自带验证与转换配置，并可输出机器读取的报告。真实接入应选择仅验证的 PDF/X-4 配置，记录引擎版本、配置散列、PDF 散列与完整报告，禁止用转换后的 PDF 结果认证原 PDF。[Using Profiles](https://help.callassoftware.com/m/pdftoolbox/l/660026-using-profiles)、[Creating a report](https://hilfe.callassoftware.com/m/59504/l/665220-creating-a-report-using-profiles)

它的官方下载需账号，CLI 运行需授权或试用激活；本轮未注册账号、购买授权或发送激活邮件，因此没有执行该引擎。[官方安装与激活](https://hilfe.callassoftware.com/m/59504/l/665202-installation-and-activation-of-pdftoolbox-server-cli)

Ghent Output Suite 用来验证处理、渲染和输出工作流，不是通用文件合规判定器。GWG 对输出样本的符合性说明也不是当前 PDF 文件的完整 ISO 验证报告。[GWG Compliance](https://gwg.org/resources/ghent-pdf-output-suite/compliance-and-instructions/)
