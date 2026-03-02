# Codex Manager

<div align="center">
  <img src="src-tauri/icons/128x128.png" alt="Codex Manager" width="128" height="128" />
  <h1>Codex Manager</h1>
  <p>管理多个 OpenAI Codex CLI 账户的精美原生桌面工具</p>
  
  ![Platform](https://img.shields.io/badge/platform-macOS-blue)
  ![Tauri](https://img.shields.io/badge/Tauri-v2-orange)
  ![React](https://img.shields.io/badge/React-18-61DAFB)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
</div>

---

## ✨ 功能特性

- 🔐 **ChatGPT OAuth 登录** — 点击即弹出浏览器授权，自动保存
- ⚡ **一键账户切换** — < 200ms 完成切换，自动写入 `~/.codex/auth.json`
- 📊 **Token 用量可视化** — 5小时额度环形图 + 7日趋势折线图
- 🎨 **精美深色 UI** — macOS 原生风格 + 玻璃拟态设计
- 🔒 **本地安全存储** — 凭据仅存本地，绝不上传

## 🚀 快速开始

### 环境要求
- macOS 12+
- Node.js 18+
- Rust 1.77+

### 开发运行

```bash
# 安装依赖
npm install

# 安装 Rust Tauri CLI
cargo install tauri-cli --version "^2" --locked

# 启动开发模式
cargo tauri dev
```

### 构建发布版

```bash
cargo tauri build
```

## 📖 OAuth 登录流程

1. 点击「添加账户」→「ChatGPT OAuth 登录」
2. 系统默认浏览器自动打开 ChatGPT 授权页
3. 完成授权后浏览器跳转回本地回调
4. App 自动捕获 Token，填写账户名即可保存

## 🛠 技术架构

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2 (Rust) |
| 前端 | React 18 + TypeScript + Vite |
| 状态管理 | Zustand |
| 图表 | Recharts |
| OAuth | PKCE + auth.openai.com |

## 📄 许可证

MIT License
