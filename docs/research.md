# REA 调查与独立实现边界

2026-10-13；目标为用户本地安装包中的 `newbd.exe` 与 `pass2.exe`。研究过程未启动这些程序。

## 实际完成的分析

REA 6.4.0 `inspect-artifact` 和 `inspect-pe-resources` 分析，安装包 MSI 文件表只读查询、指定 CAB 成员提取，以及 REA 标定资源范围内的补充字符串表解码。

| 目标 | SHA-256 | REA Evidence |
| --- | --- | --- |
| newbd.exe | 52827784ac90bb002fab9413611696b82466b317b41aa8a21b3b143d60488256 | ev_27bc231992ba127fac5fa7acf8ea48d06e0309eda2189b8204b02bec6f14cc89 |
| pass2.exe | 24acf2505320c8bdda07a51abd80c8ac3c96f7958b940246003e9bc74d5d89eb | ev_4431aa75c54b0d1dd67453d7ae8597f0d2302936a69a3885c904e3e15761b617 |

资源证据显示编辑器为 PE32 x86，拥有 421 个资源，其中包括菜单、对话框和字符串。字符串表带有 FBD 小样、PRO 参数、S10/NPS 大样的界面关联声明，以及 pass1/pass2 排版阶段、段字定位、版心、续表和竖排的诊断线索。

这些是静态文件观察，不是动态功能验证，不能据此恢复完整格式或算法。产品采用文稿模型、独立版式参数和可视化分页，是本项目的设计选择，不是从二进制恢复的内部数据结构。

## 原生分析进展与未完成项

首次分析曾因缺少 Ghidra/JDK 返回 `provider_unavailable`；本轮已安装研究依赖并解决中文路径兼容问题。REA 已成功打开 pass2，识别 4,248 个函数、1,083 条字符串。概览证据：`ev_20941ff854d8ee7577f939cbd0312d5ef98cab41c900c8b041d5b8ef098d6a0a`。

已验证 LoadStringA 交叉引用、资源字符串读取与动态扩容辅助函数；函数证据 `ev_cf574d9ee7422c62500812287e99ef575551c6a726b3c94377400b9bb6973e21`。两个疑似续表诊断引用均被进一步分析排除，没有用错误命中推断业务算法。

仍未恢复版心、续表、字体度量或完整分页算法。原版文件格式无损读写、2008 手册与 11.0 的差异、同输入同字体原版输出对照也未完成。不能宣称已还原原排版内核。详细证据索引在本机 `.research/founder/native-evidence-index.json`，完整范围见 [兼容矩阵](compatibility-matrix.md)。

## 后续可复现入口

按 [REA Windows Ghidra 文档](https://github.com/morluto/rea/blob/main/docs/windows-ghidra-p0.md) 安装适配版本引擎和 JDK，再执行：

```powershell
$env:GHIDRA_INSTALL_DIR = "实际 Ghidra 安装目录"
$env:JAVA_HOME = "实际 JDK 目录"
rea doctor --provider ghidra --json
rea analyze "实际提取的 newbd.exe 路径" --provider ghidra --json
```

从 pass2 的版心尺寸诊断着手建立资源引用、调用与数据流证据，再用自有小文档逐项验证行为。字体、公式、表格和图文绕排需要独立样本与回归测试。

完整原始 Evidence 仅存于本机工程外 `../.research/founder/`，不随源码分发。REA 自身为独立第三方 MIT 工具，发行资料见 [REA 仓库](https://github.com/morluto/rea)。
