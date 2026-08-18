# ADR-0003：zip 素材包格式契约

**Status:** Accepted

**Date:** 2026-08-18

## 背景

工单 07 要求导入 API 接收 zip 上传与本地目录两种来源，导入的素材落入文件系统并经
`/api/dsh-jx/*` 素材路由可服务。zip 包是用户导入素材的主要载体（管理界面"选 zip"按钮），
需要一个明确的格式契约，使：

- 导入端（本插件）与产出端（素材打包工具 / 手工制作）对 zip 结构有共同理解；
- manifest 可被机器读，也可在无 manifest 时从文件结构推断；
- 路径穿越等安全风险在契约层即被排除。

## 决策

### zip 包结构

zip 包为标准 zip 归档，顶层可含以下条目：

```
bundle.zip
├── manifest.json          （可选；若存在则作为素材清单权威）
├── character/             （可选子目录；角色 webp）
│   ├── idle.webp
│   └── ...
├── fonts/                 （可选子目录；woff2 字体）
│   └── *.woff2
├── preview/               （可选子目录；预览 png）
│   └── *.png
└── ...                    （其他文件被忽略，除非 manifest.json 显式引用）
```

### manifest.json 格式

```json
{
  "version": 1,
  "assets": [
    {
      "path": "character/idle.webp",
      "size": 12345,
      "type": "webp"
    }
  ]
}
```

字段：

- `version`（整数）：manifest 格式版本，当前固定为 `1`。
- `assets`（数组）：素材清单条目，每条含：
  - `path`（string）：相对 zip 根的 POSIX 路径（`/` 分隔，不以 `/` 开头）。
  - `size`（非负整数）：文件字节大小。
  - `type`（`"webp"` | `"woff2"` | `"png"`）：素材类型，与扩展名派生一致。

### 子目录约定

- `character/`：角色 WebP（idle/thinking/... 等 10 态）。
- `fonts/`：woff2 字体文件。
- `preview/`：预览 PNG（深浅主题等）。

子目录名仅为约定，不强制；导入端按扩展名白名单（webp/woff2/png）提取素材，
不按子目录名过滤。子目录可嵌套（如 `character/v2/idle.webp`）。

### 命名约束

- 路径使用 POSIX 分隔符 `/`，不以 `/` 开头（相对路径）。
- 路径不含 `..` 段、null 字节、绝对路径（路径穿越防御）。
- 文件名仅含可打印非控制字符；扩展名小写（`.webp` / `.woff2` / `.png`）。

### 无 manifest 时的推断

若 zip 内无 `manifest.json`，导入端从 zip 文件列表推断：

- 遍历所有条目，按扩展名白名单过滤（仅 webp/woff2/png）。
- 每条目生成 `{ path: <相对路径>, size: <字节大小>, type: <扩展名派生> }`。
- 非白名单扩展名（如 `.txt` / `.md`）跳过。

### 落地路径

导入的素材落地到 `assets/imported/<importId>/<zip 内相对路径>`。
经素材路由 `/api/dsh-jx/imported/<importId>/<path>` 可服务。
`importId` 为 UUID，由导入 API 生成。

## 影响

- **导入端**（本插件 `src/host/import-api.ts`）：解压 zip，按白名单提取素材与 manifest.json，
  路径穿越防御（`isSafeRelativePath`），落地到 `assets/imported/<id>/`。
- **产出端**（素材打包工具 / 手工）：按本契约制作 zip，可选附 `manifest.json`。
- **KV 元数据**：`ImportRecord.manifest.assets` 存储落地后的绝对相对路径
  （`imported/<id>/<path>`），素材本体在文件系统，KV 不存二进制（ADR-0001 约束）。
- **素材路由**：已注册的 `/api/dsh-jx/*` prefix 路由自动服务 `assets/imported/` 下素材，
  无需额外路由注册。
- **安全**：路径穿越在 zip 解压层即被拒绝（`..` 段 / 绝对路径 / null 字节），
  与素材路由的路径穿越防御形成纵深防御。
