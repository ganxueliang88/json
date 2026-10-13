# JSON Atelier

一个基于 [`josdejong/jsoneditor`](https://github.com/josdejong/jsoneditor) 的纯静态 JSON 工具页，适合直接部署到 GitHub Pages。

## 本地预览

```bash
python3 -m http.server 8000
```

然后访问 `http://127.0.0.1:8000/`。

## 发布到 GitHub Pages

1. 把仓库命名为 `json`
2. 推送到 GitHub
3. 在仓库 `Settings -> Pages`
4. 选择默认分支和根目录 `/`
5. 发布后访问 `https://<username>.github.io/json/`

## 功能

- `Format`
- `Compact`
- `Save`
- `History`
- `Zoom In / Zoom Out`
- `Code / Tree`
- `Import`
- `Export`
- `Clear`

## 自动纠错与拆分

- 粘贴标准 JSON 后可直接格式化；对于 Python 字典/列表的文本表示（单引号、`None`、`True`、`False`、尾随逗号），点击「自动纠错」可转成标准 JSON。格式化、压缩、导入文件和切换树视图也能读取这类输入。
- 对输入的多个数组（例如两行各一个列表）或多个对象，自动合并为顶层数组；点击「拆分列表」逐项展示。嵌套数组会按索引路径展开，列表中的 JSON 字符串也会尝试解析展示；点击「在编辑器中打开」可单独查看/编辑某项。
- 转换只解析数据字面量，不会执行输入中的代码；不支持的语法会报错，原输入保留。

运行解析器测试：`node --test input-parser.test.js`。

## 按值找路径

在「按值找路径」输入值（如 `普通号`），页面会从当前完整数据中查找所有匹配的叶子值，实时列出以 `data` 为根的路径，如 `data['doctor']['doctor_name']`。数组下标使用 `data[0]`；相同值出现多次会全部列出，可逐条点击「复制路径」。支持部分匹配和数字、布尔值、null 的文本匹配；清空搜索框即可收起结果。输入 Python 字典文本时也可直接查找，不会修改编辑器内容。
