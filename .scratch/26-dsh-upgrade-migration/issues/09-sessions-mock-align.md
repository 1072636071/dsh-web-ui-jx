# 测试层 MockSessions / SessionBinding 对齐新版接口

**Status:** done

**Blocked by:** 02, 03

**构建内容：** 客户端测试的假会话与绑定对象符合新版 `ISessions`/`SessionBinding`，升级后测试可编译、行为可断言。

**验收标准：**

- [ ] MockSessions 补全新版 `ISessions` 全部方法与属性
- [ ] `SessionBinding` 构造含新版必需字段（如 eventSource）
- [ ] 旧 `currentProvideInfo` 用法替换/移除，改用新版等价 API 或删除断言
- [ ] overlay-session-runtime / variant-rotation / new-session-greeting 用例全绿

## 评论

证据：overlay-session-runtime.test.ts L171-187（binding 缺 eventSource）、new-session-greeting.test.ts L87（currentProvideInfo 不存在）。