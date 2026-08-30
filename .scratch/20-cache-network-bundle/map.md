# 20-cache-network-bundle — 地图

> 来源：memorial 017 → PRD 20-cache-network-bundle（to-spec）→ 拆单（to-tickets）。

## 目标

网络、缓存与包体：时长 manifest（01）、inspect 缓存（02）、ai-title 服务端缓存（03）、ai-title 客户端 LRU（04）、素材减重（05）、client 压缩（06）、体积基线（07）。

## 阻塞图

全部工单无阻塞。

```
01 时长 manifest（无阻塞）
02 inspect 缓存（无阻塞）
03 ai-title 服务端缓存（无阻塞）
04 ai-title 客户端 LRU（无阻塞）
05 素材减重（无阻塞，先试压后全量）
06 client 压缩（无阻塞，可行性驱动）
07 体积基线（无阻塞；基线建议在 18-04 复核产物后固化）
```

## 已做决策

- 零新建运行时 seam：01 走构建期 manifest，不新建 host 路由。
- 缓存失效时机敏感：02 必须随 archived/retention 失效（ADR-0028）；01/03/04 新增模块级缓存须有清理入口（ADR-0017）。
- 05 先单文件试压（happy.webp）确认循环三原则与视觉，再全量治理 >6 MB 文件；触动的资产按 ADR-0012/0021 口径复核。
- 06 是一致性假设：验证不可行就关闭，不裸开压缩。
