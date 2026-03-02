# Codex Manager — 产品需求文档 (PRD)

> 版本: v0.1.0 | 日期: 2026-03-02 | 状态: 草稿

---

## 一、项目背景

OpenAI Codex CLI 目前仅支持单账户运行，认证信息存储于 `~/.codex/auth.json`。
对于拥有多个 ChatGPT 账户（如 Plus + Pro）的用户，在账户之间切换极为不便：需要手动替换文件、重新登录，且无法直观地看到每个账户的 Token 使用情况。

**Codex Manager** 参考 Antigravity Manager 的产品理念，提供一个精美、轻量的 macOS 原生桌面工具，专解上述痛点。

---

## 二、目标用户

- 个人开发者，持有 2~5 个 ChatGPT 账户（Plus / Pro 套餐）
- 重度使用 Codex CLI，频繁遇到 5 小时速率限制
- 希望快速切换账户、继续工作，并能清楚看到每个账户的额度消耗

---

## 三、核心功能 (MVP)

### 3.1 账户管理

| 功能 | 描述 |
|------|------|
| 添加账户 | 支持两种方式：① OAuth 登录（打开浏览器授权）② 手动导入 `auth.json` |
| 删除账户 | 从管理器中移除（不影响本地文件） |
| 账户备注 | 为每个账户设置别名（如"个人 Plus"、"工作 Pro"） |
| 账户头像 | 自动抓取 ChatGPT 账户头像或显示首字母缩写 |

### 3.2 一键切换 ⭐ 最高优先级

| 功能 | 描述 |
|------|------|
| 切换账户 | 一键点击切换活跃账户，自动将对应 `auth.json` 软链接/复制到 `~/.codex/` |
| 活跃状态标识 | 绿色指示器标识当前使用中的账户 |
| 切换确认 | 切换后弹出 Toast 提示 |
| 当前账户高亮 | 在账户列表中高亮显示当前激活账户 |

### 3.3 Token 用量可视化 ⭐ 最高优先级

| 功能 | 描述 |
|------|------|
| 5小时额度 | 环形进度条显示当前 5 小时窗口内的消耗比例 |
| 每周额度 | 条形图显示本周累计用量 |
| 历史趋势 | 折线图显示过去 7 天每日消耗（本地记录） |
| 用量快照 | 每次切换账户时记录时间戳 + 估算消耗 |
| 刷新数据 | 手动刷新按钮 + 每 5 分钟自动刷新 |

> ⚠️ 注：OpenAI 官方暂无公开 API 提供精确用量数据。
> MVP 阶段使用本地估算（记录切换时间、读取 Codex CLI 日志）；
> 后续考虑通过 OpenAI Platform API 获取精确账单数据。

### 3.4 系统集成

| 功能 | 描述 |
|------|------|
| 菜单栏图标 | 点击菜单栏图标快速切换（类似 Antigravity Manager） |
| 启动项 | 可设置为开机自启 |
| 快捷键 | 全局快捷键呼出主界面（默认 ⌘+Shift+C） |

---

## 四、非功能需求

- **性能**: 切换账户 < 200ms，界面响应 < 50ms
- **安全**: auth.json 内容在本地加密存储，绝不上传云端
- **体积**: 安装包 < 20MB（Tauri 优势）
- **兼容**: macOS 12+ (Monterey 及以上)
- **国际化**: 首版支持中文界面，预留英文扩展

---

## 五、UI/UX 设计规范

### 5.1 设计风格
- **主题**: 深色模式优先（跟随系统），支持浅色切换
- **风格**: macOS 原生感 + 现代玻璃拟态（Glassmorphism）
- **色彩**: 主色调 `#10B981`（Emerald Green），点缀 OpenAI 品牌色

### 5.2 布局结构

```
┌─────────────────────────────────────────┐
│  ● Codex Manager          [_][□][×]     │  <- 无边框标题栏（拖拽区）
├──────────┬──────────────────────────────┤
│          │                              │
│ 账户列表  │    账户详情 / 用量面板         │
│          │                              │
│ [头像]   │  ┌─── Token 用量 ──────────┐  │
│ 账户 1 ✅│  │  5h 额度: [====   ] 67% │  │
│          │  │  周额度:  [==     ] 34% │  │
│ [头像]   │  └─────────────────────────┘  │
│ 账户 2   │                              │
│          │  ┌─── 历史趋势 ────────────┐  │
│ [头像]   │  │    7日折线图             │  │
│ 账户 3   │  └─────────────────────────┘  │
│          │                              │
│ [+ 添加] │  [切换到此账户]              │
└──────────┴──────────────────────────────┘
```

### 5.3 主窗口尺寸
- 默认: 800 × 560px
- 最小: 680 × 480px
- 圆角: 12px（macOS 风格）

---

## 六、技术架构

### 6.1 技术栈

| 层级 | 技术 | 理由 |
|------|------|------|
| 桌面框架 | **Tauri v2** | 轻量（< 10MB）、原生性能、Rust 安全后端 |
| 前端框架 | **React 18 + TypeScript** | 生态成熟，组件复用性强 |
| 构建工具 | **Vite** | 极速 HMR，开发体验极佳 |
| 状态管理 | **Zustand** | 轻量，适合中小型 App |
| 图表库 | **Recharts** | React 生态，API 友好 |
| 样式方案 | **Vanilla CSS + CSS Variables** | 精准控制，无框架依赖 |
| 数据存储 | **Tauri Store Plugin** (SQLite) | 本地持久化，安全可靠 |
| 加密 | **AES-256-GCM** (Rust 后端) | 保护 auth token |

### 6.2 数据流

```
用户点击「切换账户」
       ↓
React UI → Tauri invoke('switch_account', { id })
       ↓
Rust 后端:
  1. 从加密存储读取目标账户的 auth.json 内容
  2. 解密
  3. 写入 ~/.codex/auth.json
  4. 更新当前活跃账户状态
       ↓
返回成功 → React 更新 UI → Toast 提示
```

### 6.3 文件/目录结构

```
codex-manager/
├── src/                      # React 前端
│   ├── components/
│   │   ├── AccountList/      # 账户列表组件
│   │   ├── AccountDetail/    # 账户详情+用量面板
│   │   ├── TokenUsage/       # Token 用量图表
│   │   ├── AddAccount/       # 添加账户弹窗
│   │   └── common/           # 通用 UI 组件
│   ├── store/                # Zustand 状态
│   ├── hooks/                # 自定义 hooks
│   ├── types/                # TypeScript 类型
│   └── main.tsx
├── src-tauri/                # Rust 后端
│   ├── src/
│   │   ├── commands/         # Tauri commands
│   │   │   ├── account.rs    # 账户增删改查
│   │   │   ├── switcher.rs   # 切换账户逻辑
│   │   │   └── usage.rs      # 用量读取/记录
│   │   ├── crypto.rs         # 加密/解密模块
│   │   ├── storage.rs        # SQLite 持久化
│   │   └── main.rs
│   ├── tauri.conf.json
│   └── Cargo.toml
├── PRD.md                    # 本文件
└── README.md
```

---

## 七、数据模型

### Account（账户）

```typescript
interface Account {
  id: string;           // UUID
  alias: string;        // 用户自定义别名，如"个人 Plus"
  email?: string;       // 邮箱（从 auth.json 解析，可选）
  avatar?: string;      // Base64 头像或首字母颜色
  authData: string;     // 加密后的 auth.json 内容
  addedAt: number;      // 添加时间戳
  lastUsedAt?: number;  // 最后切换时间戳
  isActive: boolean;    // 是否当前激活
}
```

### UsageRecord（用量记录）

```typescript
interface UsageRecord {
  accountId: string;
  timestamp: number;    // 记录时间
  sessionTokens?: number;  // 本次会话消耗（如可获取）
  note?: string;        // 备注（如"切换前快照"）
}
```

---

## 八、开发里程碑

### Phase 1: MVP（目标 2 周）

- [ ] 项目脚手架搭建（Tauri v2 + React + TypeScript）
- [ ] 基础 UI 框架（布局、设计系统、深色主题）
- [ ] 账户管理（添加/删除/重命名）
- [ ] auth.json 导入 + 加密存储
- [ ] 一键切换账户（核心功能）
- [ ] Token 用量本地估算 + 环形进度条
- [ ] 历史趋势折线图（7日）

### Phase 2: 完善（目标 1 周）

- [ ] 菜单栏图标 + 快速切换面板
- [ ] OAuth 登录流程（打开浏览器授权）
- [ ] 全局快捷键
- [ ] 开机自启设置
- [ ] 账户头像抓取

### Phase 3: 进阶（未来）

- [ ] OpenAI Platform API 对接（精确账单数据）
- [ ] 自动轮换（5小时额度耗尽后自动切下一账户）
- [ ] 导出用量报告（CSV）
- [ ] 浅色主题
- [ ] 英文界面

---

## 九、风险与约束

| 风险 | 说明 | 缓解方案 |
|------|------|---------|
| OpenAI 无公开用量 API | 无法精确获取 Token 消耗 | MVP 用本地估算，后续对接 Platform API |
| auth.json 结构变更 | OpenAI 可能更新认证格式 | 版本检测 + 降级处理 |
| macOS 权限 | 写入 `~/.codex/` 需要确认权限 | Tauri 权限配置 + 首次运行引导 |
| 多账户 ToS | 需用户确认所有账户归本人所有 | 添加账户时显示免责声明 |

---

## 十、开始执行

确认以上规划后，执行步骤：

```bash
# Step 1: 初始化 Tauri 项目
cd "/Users/zengtao/Doc/My code/codex manager"
npm create tauri-app@latest . -- --template react-ts --manager npm

# Step 2: 安装依赖
npm install
npm install zustand recharts

# Step 3: 安装 Tauri 插件
npm install @tauri-apps/plugin-store @tauri-apps/plugin-shell

# Step 4: 启动开发模式
npm run tauri dev
```
