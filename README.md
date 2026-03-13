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
