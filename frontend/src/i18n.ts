import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Translation resources
const resources = {
  en: {
    translation: {
      loading: "Scanning local Docker topology space...",
      title: "DockerCrafter Workspace",
      subtitle:
        "Smart Workspace Mode: Automatically aggregated local Compose projects & standalone containers • Last sync: {{lastUpdated}}",
      syncing: "Syncing...",
      backendStatus: "Backend Status: Online (Go 1.26)",
      stats: {
        workspaces: "App Workspaces",
        containers: "Total Containers",
        running: "Running",
        stopped: "Stopped",
        cpu: "Total CPU Load",
        memory: "Memory Overhead",
      },
      filter: {
        searchPlaceholder: "Search workspaces, container names, images...",
        statusAll: "All",
        statusRunning: "Running",
        statusStopped: "Stopped",
        typeAll: "All Modes",
        typeCompose: "Compose",
        typeStandalone: "Standalone",
        sortBy: "Sort By:",
        sortName: "Workspace Name",
        sortContainers: "Container Count",
        sortCpu: "CPU Load",
        sortMemory: "Memory Consumption",
      },
      noMatch: "No matching workspaces or containers found",
      noMatchSub:
        "Please try clearing the search keywords or resetting filter options",
      toast: {
        batchStart: "Batch start command sent to workspace: {{name}}",
        batchStop: "Batch stop command sent to workspace: {{name}}",
        containerStart: "Sent start command to container {{name}}",
        containerStop: "Sent stop command to container {{name}}",
        containerRestart: "Sent restart command to container {{name}}",
        backendUpgradeTip:
          "Tip: To enable control and instruction automation functions on the frontend, the backend API needs to be upgraded as well. Please connect to the control backend.",
      },
      workspace: {
        services: "SERVICES",
        running: "RUNNING",
        composeProject: "Compose Project",
        standalone: "Standalone",
        status: {
          composeRunning: "Compose Running",
          standaloneRunning: "Standalone Running",
          composePartial: "Compose Partial",
          standalonePartial: "Standalone Partial",
          composeStopped: "Compose Stopped",
          standaloneStopped: "Standalone Stopped",
        },
        totalServices: "TOTAL SERVICES: {{count}}",
        localEnv: "LOCAL ENVIRONMENT",
        startAll: "Start all containers in workspace",
        stopAll: "Stop all containers in workspace",
        expand: "Expand Workspace",
        collapse: "Collapse Workspace",
      },
      container: {
        stop: "Stop Container",
        start: "Start Container",
        restart: "Restart Container",
        logs: "View Logs / Terminal",
        image: "Image",
        status: "Status",
        internalPort: "Int",
        noPorts: "No external ports mapped",
      },
      logsModal: {
        title: "Container Logs: [{{name}}]",
        close: "Close",
        autoScroll: "Auto Scroll",
        refreshing: "Refreshing...",
        fetchError: "Failed to fetch logs",
        empty: "No logs available",
        truncatedWarning:
          "[Notice] Early logs truncated to maintain performance. Buffer limit: {{limit}} lines.",
      },
    },
  },
  zh: {
    translation: {
      loading: "正在扫描本地 Docker 拓扑空间...",
      title: "DockerCrafter 工作区",
      subtitle:
        "智能工作区模式：已自动聚合本地 Compose 项目与独立容器 • 最后同步：{{lastUpdated}}",
      syncing: "同步中...",
      backendStatus: "后端状态: 在线 (Go 1.26)",
      stats: {
        workspaces: "应用工作区",
        containers: "容器总数",
        running: "运行中",
        stopped: "已停止",
        cpu: "总 CPU 开销",
        memory: "运行内存开销",
      },
      filter: {
        searchPlaceholder: "搜索工作区、容器名称、镜像...",
        statusAll: "全部",
        statusRunning: "运行中",
        statusStopped: "已停止",
        typeAll: "全部模式",
        typeCompose: "Compose",
        typeStandalone: "独立容器",
        sortBy: "排序:",
        sortName: "工作区名称",
        sortContainers: "容器数量",
        sortCpu: "CPU 负荷",
        sortMemory: "内存消耗",
      },
      noMatch: "没有找到匹配的工作区或容器",
      noMatchSub: "请尝试清除搜索关键字或重置过滤器选项",
      toast: {
        batchStart: "批量启动命令已发送至工作区：{{name}}",
        batchStop: "批量停止命令已发送至工作区：{{name}}",
        containerStart: "已向容器 {{name}} 发送启动 (Start) 指令",
        containerStop: "已向容器 {{name}} 发送停止 (Stop) 指令",
        containerRestart: "已向容器 {{name}} 发送重启 (Restart) 指令",
        backendUpgradeTip:
          "提示：在前端启用控制与指令自动化相关功能，需要同时将后端 API 升级。请连接控制后端。",
      },
      workspace: {
        services: "服务",
        running: "运行中",
        composeProject: "Compose 项目",
        standalone: "独立容器",
        status: {
          composeRunning: "Compose 运行中",
          standaloneRunning: "独立容器运行中",
          composePartial: "Compose 部分运行",
          standalonePartial: "独立容器部分运行",
          composeStopped: "Compose 已停止",
          standaloneStopped: "独立容器已停止",
        },
        totalServices: "服务总数: {{count}}",
        localEnv: "本地环境",
        startAll: "启动工作区所有容器",
        stopAll: "停止工作区所有容器",
        expand: "展开工作区",
        collapse: "折叠工作区",
      },
      container: {
        stop: "停止容器",
        start: "启动容器",
        restart: "重启容器",
        logs: "查看日志 / 终端",
        image: "镜像",
        status: "状态",
        internalPort: "内部",
        noPorts: "未映射外部端口",
      },
      logsModal: {
        title: "容器日志: [{{name}}]",
        close: "关闭",
        autoScroll: "自动滚动",
        refreshing: "刷新中...",
        fetchError: "获取日志失败",
        empty: "暂无日志",
        truncatedWarning:
          "[提示] 已截断早期日志以维持性能，当前缓冲区限制：{{limit}} 行",
      },
    },
  },
};

const savedLanguage = localStorage.getItem("docker-dev-panel-lang") || "zh";

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage,
  fallbackLng: "zh",
  interpolation: {
    escapeValue: false, // React already escapes values
  },
});

export default i18n;
