# 第三方组件

公式预览使用 KaTeX 0.19.0，按 MIT 许可分发。原始许可保存在 `vendor/katex/LICENSE`，项目地址 https://github.com/KaTeX/KaTeX 。代码、CSS 与字体来自官方 npm 包，浏览器运行时不访问 CDN。

正式 PDF 后端调用用户安装的 XeLaTeX / TeX Live，不在源码包中捆绑 TeX 发行版或系统字库。运行前请安装后端所需依赖，详见 `docs/pdf-backend.md`。

REA 仅用于本地研究，不是应用依赖，不随本源码包分发。
