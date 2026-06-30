import { useEffect, useState, useMemo } from "react";
import type { ProjectWorkspace } from "./types";
import { formatBytes } from "./utils/format";
import { WorkspaceCard } from "./components/WorkspaceCard";
import { LogsModal } from "./components/LogsModal";
import { TerminalModal } from "./components/TerminalModal";
import { useTranslation } from "react-i18next";
import { GlassPanel, ProgressBar } from "./components/ui";
import { cn } from "./utils/cn";
import { useDebounce } from "./hooks/useDebounce";

export default function App() {
  const { t, i18n } = useTranslation();
  const [workspaces, setWorkspaces] = useState<ProjectWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "running" | "stopped"
  >("all");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "compose" | "standalone"
  >("all");
  const [sortBy, setSortBy] = useState<
    "name" | "containers" | "cpu" | "memory"
  >("name");
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<
    Record<string, boolean>
  >({});
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [selectedLogContainer, setSelectedLogContainer] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [selectedTerminalContainer, setSelectedTerminalContainer] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // 轮询数据
  const fetchData = () => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        setWorkspaces(data || []);
        setLoading(false);
        setLastUpdated(new Date().toLocaleTimeString());
      })
      .catch((err) => {
        console.error("❌ 无法连接到 Go 后端: ", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 3000); // 每 3 秒自动刷新一次
    return () => clearInterval(timer);
  }, []);

  // 辅助函数：弹出提示
  const showToast = (message: string) => {
    const id =
      Date.now().toString() + Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  // 切换折叠状态
  const toggleCollapse = (name: string) => {
    setCollapsedWorkspaces((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  // 处理单个容器操作
  const handleContainerAction = async (
    id: string,
    action: "start" | "stop" | "restart",
    actionName: string,
    name: string,
  ) => {
    showToast(t(`toast.${actionName}ing`, { name, defaultValue: `${actionName}ing ${name}...` }));
    try {
      const res = await fetch("/api/containers/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) {
        showToast(t(`toast.${actionName}Success`, { name, defaultValue: `Successfully ${actionName}ed ${name}!` }));
        setTimeout(fetchData, 300); // 预留时间给后端 Events 缓存更新
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(t(`toast.${actionName}Error`, { name, defaultValue: `Failed to ${actionName} ${name}: ${errData.error || res.statusText}` }));
      }
    } catch (err) {
      console.error(err);
      showToast(t(`toast.${actionName}Error`, { name, defaultValue: `Failed to ${actionName} ${name}` }));
    }
  };

  // 处理工作区批量操作
  const handleBatchAction = async (
    projectName: string,
    action: "start" | "stop",
    actionName: string,
  ) => {
    const workspace = workspaces.find((ws) => ws.projectName === projectName);
    if (!workspace) return;

    showToast(t(`toast.${actionName}ing`, { name: `workspace ${projectName}`, defaultValue: `${actionName}ing workspace ${projectName}...` }));

    try {
      const promises = workspace.containers.map((c) =>
        fetch("/api/containers/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: c.id, action }),
        }),
      );

      const results = await Promise.all(promises);
      const allOk = results.every((r) => r.ok);

      if (allOk) {
        showToast(t(`toast.${actionName}Success`, { name: `workspace ${projectName}`, defaultValue: `Successfully ${actionName}ed workspace ${projectName}!` }));
        setTimeout(fetchData, 300);
      } else {
        showToast(t(`toast.${actionName}Error`, { name: `workspace ${projectName}`, defaultValue: `Some containers failed to ${actionName} in ${projectName}` }));
        setTimeout(fetchData, 300);
      }
    } catch (err) {
      console.error(err);
      showToast(t(`toast.${actionName}Error`, { name: `workspace ${projectName}`, defaultValue: `Failed to ${actionName} workspace ${projectName}` }));
    }
  };

  // 全局数据统计计算
  const stats = useMemo(() => {
    let totalWorkspaces = workspaces.length;
    let totalContainers = 0;
    let runningContainers = 0;
    let stoppedContainers = 0;
    let totalCPU = 0;
    let totalMemory = 0;

    workspaces.forEach((ws) => {
      ws.containers.forEach((c) => {
        totalContainers++;
        if (c.state === "running") {
          runningContainers++;
          totalCPU += c.cpuUsage;
          totalMemory += c.memoryUsage;
        } else {
          stoppedContainers++;
        }
      });
    });

    return {
      totalWorkspaces,
      totalContainers,
      runningContainers,
      stoppedContainers,
      totalCPU,
      totalMemory,
    };
  }, [workspaces]);

  // 过滤和排序处理后的数据
  const processedWorkspaces = useMemo(() => {
    // 1. 过滤
    const filtered = workspaces
      .map((ws) => {
        // 过滤容器
        const filteredContainers = ws.containers.filter((c) => {
          const matchesSearch =
            c.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            c.image
              .toLowerCase()
              .includes(debouncedSearchQuery.toLowerCase()) ||
            ws.projectName
              .toLowerCase()
              .includes(debouncedSearchQuery.toLowerCase());

          const isRunning = c.state === "running";
          const matchesStatus =
            statusFilter === "all" ||
            (statusFilter === "running" && isRunning) ||
            (statusFilter === "stopped" && !isRunning);

          return matchesSearch && matchesStatus;
        });

        return {
          ...ws,
          containers: filteredContainers,
        };
      })
      .filter((ws) => {
        // 过滤工作区本身
        const matchesType =
          typeFilter === "all" ||
          (typeFilter === "compose" && ws.isCompose) ||
          (typeFilter === "standalone" && !ws.isCompose);

        return ws.containers.length > 0 && matchesType;
      });

    // 2. 排序
    return filtered.sort((a, b) => {
      if (sortBy === "name") {
        return a.projectName.localeCompare(b.projectName);
      } else if (sortBy === "containers") {
        return b.containers.length - a.containers.length;
      } else if (sortBy === "cpu") {
        const getCpuSum = (ws: ProjectWorkspace) =>
          ws.containers.reduce((sum, c) => sum + c.cpuUsage, 0);
        return getCpuSum(b) - getCpuSum(a);
      } else if (sortBy === "memory") {
        const getMemSum = (ws: ProjectWorkspace) =>
          ws.containers.reduce((sum, c) => sum + c.memoryUsage, 0);
        return getMemSum(b) - getMemSum(a);
      }
      return 0;
    });
  }, [workspaces, debouncedSearchQuery, statusFilter, typeFilter, sortBy]);

  if (loading && workspaces.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 text-slate-400 gap-4">
        <svg
          width="40"
          height="40"
          className="animate-spin h-10 w-10 text-cyan-500"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="text-sm font-medium tracking-wider text-slate-300 animate-pulse">
          {t("loading")}
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Toast 弹出提示层 */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="glass-panel bg-slate-900 border-cyan-500/30 text-cyan-400 px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-bounce pointer-events-auto transition-all"
          >
            <svg
              width="20"
              height="20"
              className="h-5 w-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* 顶部通栏 Header */}
      <header className="border-b border-slate-900 bg-slate-900/40 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
              🐳 {t("title")} v1.0
            </h1>
            <p className="text-slate-400 text-xs mt-1 font-mono">
              {t("subtitle", { lastUpdated: lastUpdated || t("syncing") })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* 语言切换器 */}
            <div className="flex items-center bg-slate-900/60 border border-slate-800 p-0.5 rounded-xl text-xs font-mono">
              <button
                onClick={() => {
                  i18n.changeLanguage("zh");
                  localStorage.setItem("docker-dev-panel-lang", "zh");
                }}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  i18n.language === "zh"
                    ? "bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30 text-blue-400 font-bold"
                    : "border border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                中文
              </button>
              <button
                onClick={() => {
                  i18n.changeLanguage("en");
                  localStorage.setItem("docker-dev-panel-lang", "en");
                }}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  i18n.language === "en"
                    ? "bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30 text-blue-400 font-bold"
                    : "border border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                EN
              </button>
            </div>
            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono">
              <div className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40 animate-pulse" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </div>
              <span className="text-slate-300">{t("backendStatus")}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 mt-8">
        {/* 系统健康与概览指标卡片组 */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="glass-panel rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-medium">
                {t("stats.workspaces")}
              </span>
              <h3 className="text-2xl font-bold mt-1 text-indigo-400">
                {stats.totalWorkspaces}
              </h3>
            </div>
            <div className="p-2.5 bg-indigo-500/10 rounded-lg text-indigo-400">
              <svg
                width="20"
                height="20"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
          </div>

          <div className="glass-panel rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium">
                  {t("stats.containers")}
                </span>
                <h3 className="text-2xl font-bold mt-1">
                  {stats.totalContainers}
                </h3>
              </div>
              <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-400">
                <svg
                  width="20"
                  height="20"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
            </div>
            {stats.totalContainers > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>
                    {t("stats.running")} ({stats.runningContainers})
                  </span>
                  <span>
                    {t("stats.stopped")} ({stats.stoppedContainers})
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full"
                    style={{
                      width: `${(stats.runningContainers / stats.totalContainers) * 100}%`,
                    }}
                  ></div>
                  <div
                    className="bg-rose-500 h-full"
                    style={{
                      width: `${(stats.stoppedContainers / stats.totalContainers) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          <div className="glass-panel rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium">
                  {t("stats.cpu")}
                </span>
                <h3 className="text-2xl font-bold mt-1 text-cyan-400">
                  {stats.totalCPU.toFixed(1)}%
                </h3>
              </div>
              <div className="p-2.5 bg-cyan-500/10 rounded-lg text-cyan-400">
                <svg
                  width="20"
                  height="20"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
            </div>
            {stats.totalContainers > 0 && (
              <div className="mt-3">
                <ProgressBar
                  value={stats.totalCPU}
                  max={100}
                  showBackground={false}
                />
              </div>
            )}
          </div>

          <div className="glass-panel rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium">
                  {t("stats.memory")}
                </span>
                <h3 className="text-2xl font-bold mt-1 text-purple-400">
                  {formatBytes(stats.totalMemory)}
                </h3>
              </div>
              <div className="p-2.5 bg-purple-500/10 rounded-lg text-purple-400">
                <svg
                  width="20"
                  height="20"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                  />
                </svg>
              </div>
            </div>
            {stats.totalContainers > 0 && (
              <div className="mt-3">
                <ProgressBar
                  value={stats.totalMemory}
                  max={4 * 1024 * 1024 * 1024}
                  showBackground={false}
                  className="[&>div]:bg-purple-500"
                />
              </div>
            )}
          </div>
        </section>

        {/* 过滤、搜索、排序操作面板 */}
        <section className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 mb-8 flex flex-col lg:flex-row gap-4 items-center justify-between">
          {/* 搜索框 */}
          <div className="relative w-full lg:w-96">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
              <svg
                width="20"
                height="20"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
            <input
              type="text"
              placeholder={t("filter.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
              >
                <svg
                  width="16"
                  height="16"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l18 18"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* 条件过滤器群组 */}
          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
            {/* 按运行状态过滤 */}
            <div className="flex items-center bg-slate-950 border border-slate-800 p-0.5 rounded-lg">
              <button
                onClick={() => setStatusFilter("all")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  statusFilter === "all"
                    ? "bg-slate-800 text-slate-100 shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {t("filter.statusAll")}
              </button>
              <button
                onClick={() => setStatusFilter("running")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  statusFilter === "running"
                    ? "bg-emerald-950/50 text-emerald-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {t("filter.statusRunning")}
              </button>
              <button
                onClick={() => setStatusFilter("stopped")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  statusFilter === "stopped"
                    ? "bg-rose-950/50 text-rose-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {t("filter.statusStopped")}
              </button>
            </div>

            {/* 按部署模式过滤 */}
            <div className="flex items-center bg-slate-950 border border-slate-800 p-0.5 rounded-lg">
              <button
                onClick={() => setTypeFilter("all")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  typeFilter === "all"
                    ? "bg-slate-800 text-slate-100 shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {t("filter.typeAll")}
              </button>
              <button
                onClick={() => setTypeFilter("compose")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  typeFilter === "compose"
                    ? "bg-indigo-950/50 text-indigo-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {t("filter.typeCompose")}
              </button>
              <button
                onClick={() => setTypeFilter("standalone")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  typeFilter === "standalone"
                    ? "bg-slate-800 text-slate-200 shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {t("filter.typeStandalone")}
              </button>
            </div>

            {/* 排序筛选 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {t("filter.sortBy")}
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="name">{t("filter.sortName")}</option>
                <option value="containers">{t("filter.sortContainers")}</option>
                <option value="cpu">{t("filter.sortCpu")}</option>
                <option value="memory">{t("filter.sortMemory")}</option>
              </select>
            </div>
          </div>
        </section>

        {/* 项目/工作区看板列表 */}
        {processedWorkspaces.length === 0 ? (
          <GlassPanel className="p-16 text-center text-slate-500 rounded-2xl">
            <svg
              width="48"
              height="48"
              className="mx-auto h-12 w-12 text-slate-700 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-base font-medium text-slate-400">
              {t("noMatch")}
            </p>
            <p className="text-xs text-slate-600 mt-1">{t("noMatchSub")}</p>
          </GlassPanel>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {processedWorkspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.projectName}
                workspace={workspace}
                isCollapsed={!!collapsedWorkspaces[workspace.projectName]}
                onToggleCollapse={() => toggleCollapse(workspace.projectName)}
                onBatchStart={(name) =>
                  handleBatchAction(name, "start", "start")
                }
                onBatchStop={(name) => handleBatchAction(name, "stop", "stop")}
                onContainerStart={(id, name) =>
                  handleContainerAction(id, "start", "start", name)
                }
                onContainerStop={(id, name) =>
                  handleContainerAction(id, "stop", "stop", name)
                }
                onContainerRestart={(id, name) =>
                  handleContainerAction(id, "restart", "restart", name)
                }
                onContainerLogs={(id, name) =>
                  setSelectedLogContainer({ id, name })
                }
                onContainerTerminal={(id, name) =>
                  setSelectedTerminalContainer({ id, name })
                }
              />
            ))}
          </div>
        )}
      </div>

      {selectedLogContainer && (
        <LogsModal
          containerId={selectedLogContainer.id}
          containerName={selectedLogContainer.name}
          onClose={() => setSelectedLogContainer(null)}
        />
      )}

      {selectedTerminalContainer && (
        <TerminalModal
          containerId={selectedTerminalContainer.id}
          containerName={selectedTerminalContainer.name}
          onClose={() => setSelectedTerminalContainer(null)}
        />
      )}
    </div>
  );
}
