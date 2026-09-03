# 用户名设置 + 带名问候

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 用户在设置卡填写自己的名字后，大标题问候变为「上午好，{name}，有什么需要我搞定的么？」；没填或清空时回到不带名问候。

**验收标准：**

- [ ] 设置卡新增「个性化问候」分区，含名字输入
- [ ] 名字经 `createPersistentSetting` 持久化（localStorage），键名进 `STORAGE_KEYS` 单点
- [ ] 校验：trim 后非空才有效；上限 16 字符；剥离控制字符与换行；非法输入行内提示且不写入
- [ ] 名字有效 → hero 显示带名问候（带名/不带名是两套完整文案，不跨 key 拼接）
- [ ] 未填 / 全空白 → hero 显示不带名问候
- [ ] 宿主 settings memory 模式（远端浏览器）下名字照常可用
- [ ] `npm run build && npm run verify` 通过

## 评论

（评论与对话历史追加于此，新内容置于最前。）
