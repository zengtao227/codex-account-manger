# Codex Manager

<div align="center">
  <img src="src-tauri/icons/128x128.png" alt="Codex Manager" width="128" height="128" />
  <h1>Codex Manager v0.1.2</h1>
  <p>多账户管理、一键切换、极速响应的 Codex 辅助工具</p>
  
  ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue)
  ![Tauri](https://img.shields.io/badge/Tauri-v2-orange)
  ![React](https://img.shields.io/badge/React-18-61DAFB)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
</div>

---

## ✨ 功能特性

- 🔐 **ChatGPT OAuth 极速登录** — 自动处理 PKCE 流程，完成后浏览器自动关闭，Token 自动捕获。
- 🔄 **一键无缝切换账户** — 支持保存多个 OpenAI 账户，双击即刻切换。
- 🚀 **智能自动重启** — 切换账户后，Codex Manager 会**强制杀死旧进程并自动拉起 Codex IDE**，确保新凭据立即生效。
- 💻 **跨平台支持** — 同时完美适配 **macOS (Intel/Apple Silicon)** 和 **Windows 10/11**。
- 🎨 **原生审美设计** — 玻璃拟态深色模式，macOS 原生窗口控制与拖拽感。
- 🔒 **本地隐私保护** — 所有登录凭据（`auth.json`）仅存储在您的本地 `.codex` 目录，绝不上传云端。

## 🚀 立即体验

前往 [GitHub Releases](https://github.com/zengtao227/codex-account-manger/releases) 下载最新安装包。

- **macOS**: `.dmg` (支持 Apple Silicon 和 Intel) 或直接下载 `.app`。
- **Windows**: `.exe` 安全安装包或 `.msi` 部署包。

## 🛠 开发运行

### 环境准备
- Node.js 18+
- Rust 1.77+
- macOS 12+ 或 Windows 10+

### 本地启动

```bash
# 1. 安装依赖
npm install

# 2. 启动开发模式
npm run tauri dev
```

### 生产构建

```bash
npm run tauri build
```

## 📖 核心逻辑

1. **OAuth 捕获**：使用 Rust 监听本地 1455 端口，自动与 OpenAI 授权服务通信。
2. **凭据管理**：自动解析 JWT 并构造符合 Codex CLI 标准的 `auth.json`。
3. **强制生效**：针对 Codex IDE 的缓存机制，App 通过 `pkill -9` (Mac) 或 `taskkill /F` (Windows) 确保 IDE 重读配置文件。

## 🛠 技术栈

| 模块 | 技术 |
|------|------|
| 核心框架 | Tauri v2 (Rust) |
| 前端逻辑 | React 18 + Zustand |
| 样式系统 | 高级 Vanilla CSS |
| 安全通信 | PKCE Flow + HTTPS |
| 跨平台适配 | Windows `taskkill` + Mac `osascript` |

## 📄 许可证

MIT License
