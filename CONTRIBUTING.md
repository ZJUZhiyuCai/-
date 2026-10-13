# 参与开发

欢迎提交问题、复现样稿和 Pull Request。项目采用 MIT 许可证；请只提交自己有权公开的代码、字体、图片和文稿。

## 本地开发

需要 Python 3.10+、Node.js 22+ 和现代 Chrome / Edge。前端使用原生 ES modules，无构建步骤。

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS / Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
python server.py
```

访问 http://127.0.0.1:8767 。修改文件后刷新页面。基础编辑无需安装可选 Python 依赖。

## 提交前检查

```sh
npm test
python -m unittest discover -s tests -p "test_*.py"
python scripts/check-acceptance.py
```

Python 测试使用 pypdf。真实 PDF 编译测试还需要 XeLaTeX、相关宏包和宋体/黑体/楷体；未安装时跳过，不能把跳过项计作通过。浏览器分页需要另行用界面验证：导入 examples 中的工程，核对内容、页数、续表、重排、保存恢复和导出。GitHub Actions 不声称验证原版兼容或印前质量。

新增能力请同时更新兼容性矩阵与验收账本，记录正例、边界例、失败例及明确限制。不要仅因按钮存在就标记整项完成。`check-acceptance.py --require-complete` 会在完整版验收未完成时以非零状态退出。

## 报告问题

请提供操作系统、浏览器、Python 版本、复现步骤、预期与实际结果，以及可公开的最小工程。涉及 PDF 时附上工具版本和错误提示。提交前去掉个人信息；不要上传原版安装包、私有字库、未获授权稿件或令牌。
