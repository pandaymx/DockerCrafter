# 🐳 DockerCrafter Dev Panel (Docker 工作区管理面板)

DockerCrafter is a smart development environment workspace manager that aggregates local standalone Docker containers and Docker Compose projects into clean, logical visual workspaces. It provides real-time performance tracking (CPU and Memory), container lifecycle controls, multi-dimensional search/sorting, and complete i18n (Chinese/English) support.

[🇬🇧 English](#-english) | [🇨🇳 中文说明](#-中文说明)

---

## 🇨🇳 中文说明

### 📝 项目简介

DockerCrafter 旨在为开发者提供一个直观、美观的本地 Docker 拓扑空间和容器管理看板。通过自动识别 Docker Compose 标签及独立运行的容器，将它们归类到不同的“应用工作区”中，并提供批处理控制与实时监控。

### ✨ 核心功能

1. 🧩 **智能拓扑空间聚合**：自动识别并聚合本地的 Compose 项目和独立容器。
2. 📈 **实时性能监控**：展示每个容器的 CPU 和内存占用指标，并提供全局系统负荷卡片。
3. ⚡ **工作区批处理**：支持对整个 Compose 工作区进行一键批量启动或停止，也可以对单个容器进行启动/停止/重启/日志查看。
4. 🔍 **灵活检索与排序**：支持按工作区名、容器名、镜像检索，可按运行状态、部署模式过滤，或按名称、容器数、CPU、内存排序。
5. 🌐 **国际化支持 (i18n)**：支持一键切换中文/英文，首选语言会自动记忆在本地浏览器存储（`localStorage`）中。

---

## 🇬🇧 English

### 📝 Project Overview

DockerCrafter aims to provide developers with an intuitive and visually pleasing dashboard for managing local Docker environments. By automatically reading Compose labels and grouping containers, it organizes services into separate "Workspaces" for bulk control and monitoring.

### ✨ Core Features

1. 🧩 **Smart Workspace Grouping**: Automatically groups container topology into Compose projects and Standalone cards.
2. 📈 **Real-time Performance Metrics**: Displays CPU & memory usage for active containers with visual health bars and system statistics.
3. ⚡ **Bulk and Individual Actions**: Start, stop, and restart containers individually or trigger bulk actions across entire Compose workspaces.
4. 🔍 **Rich Filters & Sorting**: Filter by deployment type (Compose vs. Standalone) or status (Running vs. Stopped), search text, and sort by CPU/Memory.
5. 🌐 **Dual-language i18n**: Dynamically switch between English and Chinese; user language preference is saved persistently via `localStorage`.

---

## 📂 项目结构 / Project Structure

```text
docker-dev-panel/
├── backend/                  # 🐹 Go Backend Service
│   ├── cmd/server/           # 🚀 Server Entry point
│   ├── config/               # ⚙️ Config parsers & YAML loading
│   ├── logger/               # 📝 Custom logger utilities
│   ├── models/               # 📦 Shared API JSON models
│   ├── server/               # 🕸️ HTTP router and CORS middleware
│   ├── service/              # 🐳 Docker client API interactions (Moby SDK)
│   └── go.mod                # 📄 Go module declarations
│
├── frontend/                 # 💻 React + Vite + TypeScript Frontend
│   ├── src/
│   │   ├── components/       # 🧩 WorkspaceCard & ContainerCard components
│   │   ├── utils/            # 🛠️ Byte size formatting, etc.
│   │   ├── i18n.ts           # 🌐 i18next dictionaries & initialization
│   │   ├── App.tsx           # 🎨 Dashboard UI and controls state
│   │   └── main.tsx          # 🚀 React application root
│   ├── tailwind.config.js    # 🎨 Styling layout configs (Tailwind CSS v3)
│   └── package.json          # 📄 Bun / Node package manifests
```

---

## 🛠️ 运行与开发 / How to Run

### 📋 前提条件 / Prerequisites

- 🐹 **Go**: v1.25 or higher
- 🍞 **Node.js / Bun**: Bun v1.3+ is recommended
- 🐳 **Docker**: Local Docker daemon running (accessible via socket)

### 1. 🚀 运行后端 / Start the Backend (Go)

Navigate to the `backend` directory, install packages, and start the API server:

```bash
cd backend
# 运行后端 API 服务 (端口默认为 12581)
go run ./cmd/server
```

### 2. 💻 运行前端 / Start the Frontend (Vite)

Navigate to the `frontend` directory, install frontend dependencies, and launch Vite dev server:

```bash
cd frontend
# 使用 Bun 安装依赖 / Install dependencies
bun install

# 启动开发服务器 / Start Vite Dev Server
bun run dev
```

🌐 Open [http://localhost:5173](http://localhost:5173) in your browser to view the DockerCrafter dev panel.
