# 全文期刊生产链（候选，未部署到线上）

此前 Web 的浏览器 Word 导入会丢失 OMML，画布 PDF 也不能承载整篇顺序稿件。本分支增加可选的服务端期刊引擎：DOCX 原文导入、v4 工程、中文期刊首面、复杂公式、段落锚点、全文 PDF 和逐页证据使用同一份源工程。自由版面仍走原有导出链。

## 独立服务器启用

构建目录必须是 `web/`：

```sh
npm ci
node standalone/build.mjs
```

输出包已包含 `journal-engine/`，不含 Python、TeX 或商业字体。Linux 安装 Python 3.12 与 XeLaTeX；Ubuntu CI 使用以下 TeX 包：

```sh
sudo apt-get install texlive-xetex texlive-lang-chinese texlive-latex-extra texlive-fonts-recommended
python3 -m venv /opt/shuye-python
/opt/shuye-python/bin/pip install -r /opt/shuye/current/journal-engine/requirements.txt
```

在既有私有配置中添加 `journal`，保留原有目录、域名和端口：

```json
{
  "journal": {
    "python": "/opt/shuye-python/bin/python3",
    "timeoutMs": 300000,
    "maxProofs": 200
  }
}
```

默认从服务 PATH 查找 `xelatex`；非标准安装可在 `journal.env.PATH` 写完整 PATH。首次启动实际编译中文探针并检查 PDF 几何；缺包时编辑器仍可使用，`get_journal_capabilities.enabled` 为 false，附失败原因。不要仅凭 `/healthz` 判断期刊引擎可用。

默认中文字体 Fandol，默认西文及数学字体为 TeX 字体。可显式选择已安装的 Source Han、Windows/macOS 字体组、Times New Roman，以及 `journal.mathFont:"stix-two"`（需 `unicode-math` 和已安装的 STIX Two Math）。数学字体选择同时进入编辑器、工程校验与 MCP schema；默认项目不依赖 STIX。选择不存在的字体会编译失败，不会伪称已使用指定字体。正式模板需独立确认目标字体及使用许可；Fandol 不代表期刊的最终品牌字库。

服务继续运行于专用低权限用户。TeX 禁用 shell escape，并限制输入/输出路径；校样写入数据目录的 `journal-proofs/<owner-hash>/<proof-id>/`，不映射到静态网站。父目录 0700，源快照与状态 0600；继续使用 systemd 的 `UMask=0077`、资源限制和私有临时目录。Linux/macOS 超时会终止进程组；Windows 原生部署和子进程清理尚未实机验收。

单实例同时仅运行一个导入或编译任务，繁忙返回 `JOURNAL_WORKER_BUSY_RETRY`。默认任务 300 秒、进程 JSON 输出 30 MB、下载 PDF 20 MB；每用户默认保留最多 200 份任务。启动恢复将中断任务标记为失败，可重新提交；不自动删除历史校样。上线前测量真实稿件的耗时、内存和磁盘，配置容量与备份。依赖和证据所需空间远大于静态发布包。

## 产品操作

1. “导入期刊 Word”新建工程，核对公式、图片、表格与编号报告。原始 OMML 与摘要随每个公式保存，表格单元格保留公式和局部样式。未支持的公式节点、编号和对象以错误阻止导入。
2. “期刊模板”设置字体、刊名、卷期、年份、中英文日期（`date` / `dateEn`）；在页面设置中按实际参考刊式选择单栏或双栏。在右侧为中英文题名、作者、单位、摘要、关键词及参考文献指定角色。角色由编辑指定，不从作者姓名等字符串猜测。缺失首面字段进入 PDF 诊断，缺失日期/文章编号不会由系统编造。
3. 为图片/表格指定稳定的正文目标 ID、前后顺序、允许相隔页数及题注 ID；PDF 检查目标顺序、距离、题注同页和源对象覆盖。锚点不能代替编辑确认“首次引用”是否选对。宽公式按实际字体测量后换栏或断行，不缩小整张页面或栅格化公式。
4. 保存后生成“全文期刊 PDF”，同时下载校样报告。浏览器纸面只作结构编辑预览；全文校样使用 XeLaTeX 独立断行分页。带公式的文字使用源编辑器/公式编辑器，禁止在纸面直接破坏公式占位标记。
5. 刷新后可“取回期刊校样”。源修订变化、下载期间修改或切换工程会阻止将旧校样当作最新稿。服务端校验 PDF 与报告摘要。

## AI 接口，无需 computer use

通过原有鉴权 MCP 调用下列工具。修改用 `expectedRevision`；`apply_changes` 可先 `dryRun:true`。

| 工具 | 输入/结果要点 |
| --- | --- |
| `get_journal_capabilities` | 查询当前部署是否实际启用引擎 |
| `import_journal_docx` | `projectId,title,base64`；新建 v4 工程并保留导入证据 |
| `set_journal` | 模板、字体、刊名与卷期等；完整 schema 见 `get_document_schema` |
| `apply_changes` | 按稳定块 ID 修改角色、公式、锚点、题注和栏位 |
| `start_journal_proof` | `projectId,expectedRevision`；立即返回 `proofId` 和修订 |
| `get_journal_proof` | `proofId`；查询 running/complete/failed、stale、覆盖率和预检摘要 |
| `get_journal_proof_page` | `proofId,page,offset,limit`；实际 PDF 物理页的对象坐标、文字边界，limit ≤ 200 |
| `download_journal_pdf` | `proofId`；base64 和 SHA-256；默认拒绝过期校样 |

`get_journal_proof_page` 的 lines 和 objects 分别分页，需各自读取到 totalLines/totalObjects。坐标为 pt、左上原点；文字框是字体度量框，不是墨迹或遮挡证明。`sourceDocumentSha256` 绑定 JS 工程指纹，`renderedDocumentSha256` 绑定 Python 渲染快照序列化，两者算法不同，不能互相比较。

导入报告后续保存/替换时不可清除。公式源摘要证明原始 OMML 被保留；编辑后的 TeX 可不同于原始公式，仍须复核数学语义。源稿数学数目、模型独立公式数与 Word 的 `oMathPara` 数是不同口径：后者包含表内容器，不可统称“独立公式段”。

## 验证与收费交付边界

公开样本可重复执行，不含客户稿件：

```sh
# 仓库根目录；此入口避免误导入旧根目录的同名 Python 模块
python web/journal-engine/run_tests.py
cd web
npm test
npm run build
node standalone/build.mjs
node scripts/journal-http-acceptance.mjs
```

HTTP 验收需要已安装 Python/XeLaTeX，可用 `SHUYE_PYTHON` 指定解释器。它从 DOCX 经真实鉴权、存储、编译和下载，验证 6 个数学区、2 条锚点关系、全部对象、字体嵌入以及旧版下载拒绝。运行时测试中的进程桩只证明超时/并发/隔离，不能当作排版验收。

本轮维护者在私有环境跑完一篇真实稿件：295 个数学区（48 个独立公式对象、247 个行内/表内对象；源 XML 有 63 个 oMathPara 容器）、7 幅图、7 张表、34 条文献。按参考刊式校准后，从 14 页收敛为 12 页、170×240 mm；正文与公式保持 8.2 TeX pt，修正重复行距倍率、标题后的分页约束、表格行高和公式引导句空行。最终通过鉴权 HTTP 保存、编译、下载，生成 300 dpi 的 12 张单页并逐页检查。

295 份 OMML 树与源稿相符，7 幅图保持原始字节及 PDF 中的解码像素，184 个表格单元格逐项相符，491/491 对象可定位，14/14 图表锚点检查通过。244 个源块的内容、脚注和导入证据没有变化；图像仅调整放置尺寸。客户稿件、作者信息和私有证据不进入仓库。校准方法、合成回归入口与边界见 [journal-calibration.md](journal-calibration.md)。

这些指标证明工程链和已列明的保真检查，**不等于收费成品已通过编辑及印厂验收**。恢复图像在参考刊式中的可读尺寸后，真实样稿的 7 幅图均低于 300 dpi，需原始高质量图件；不能通过缩小图或插值放大来假通过。出版日期、文章编号及引用栏等须由编辑确定；补齐后重新排版验收。12 页是当前完整源稿的校准候选，不是像素级复制，也不是未来补字段后的页数承诺。

当前报告即使无机器错误也返回 `INCOMPLETE`、`productionReady:false`；有低 DPI/缺字/越界/锚点失败则为 `BLOCKED`。下载允许用于审校，不能据此直接发印。期刊链尚未验证 PDF/X、指定印厂 ICC、叠印、总墨量、字体授权和完整中文禁则，也未完成飞翔原生重开/重排往返。逐页视觉验收、公式语义和编辑签字必须绑定具体 PDF 摘要另行记录。
