import { useEffect, useState, useMemo } from "react";
import type { ProjectWorkspace } from './types';
import { formatBytes } from './utils/format';
import { WorkspaceCard } from './components/WorkspaceCard';

export default function App() {
  const [workspaces, setWorkspaces] = useState<ProjectWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "stopped">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "compose" | "standalone">("all");
  const [sortBy, setSortBy] = useState<"name" | "containers" | "cpu" | "memory">("name");
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // 轮询数据
  const fetchData = () => {
    fetch("http://localhost:12581/api/projects")
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
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 切换折叠状态
  const toggleCollapse = (name: string) => {
    setCollapsedWorkspaces(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  // 全局数据统计计算
  const stats = useMemo(() => {
    let totalWorkspaces = workspaces.length;
    let totalContainers = 0;
    let runningContainers = 0;
    let stoppedContainers = 0;
    let totalCPU = 0;
    let totalMemory = 0;

    workspaces.forEach(ws => {
      ws.containers.forEach(c => {
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
      totalMemory
    };
  }, [workspaces]);

  // 过滤和排序处理后的数据
  const processedWorkspaces = useMemo(() => {
    // 1. 过滤
    const filtered = workspaces.map(ws => {
      // 过滤容器
      const filteredContainers = ws.containers.filter(c => {
        const matchesSearch = 
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.image.toLowerCase().includes(searchQuery.toLowerCase()) ||
          ws.projectName.toLowerCase().includes(searchQuery.toLowerCase());
        
        const isRunning = c.state === "running";
        const matchesStatus = 
          statusFilter === "all" ||
          (statusFilter === "running" && isRunning) ||
          (statusFilter === "stopped" && !isRunning);

        return matchesSearch && matchesStatus;
      });

      return {
        ...ws,
        containers: filteredContainers
      };
    }).filter(ws => {
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
        const getCpuSum = (ws: ProjectWorkspace) => ws.containers.reduce((sum, c) => sum + c.cpuUsage, 0);
        return getCpuSum(b) - getCpuSum(a);
      } else if (sortBy === "memory") {
        const getMemSum = (ws: ProjectWorkspace) => ws.containers.reduce((sum, c) => sum + c.memoryUsage, 0);
        return getMemSum(b) - getMemSum(a);
      }
      return 0;
    });
  }, [workspaces, searchQuery, statusFilter, typeFilter, sortBy]);

  if (loading && workspaces.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 text-slate-400 gap-4">
        <svg className="animate-spin h-10 w-10 text-cyan-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-sm font-medium tracking-wider text-slate-300 animate-pulse">正在扫描本地 Docker 拓扑空间...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      
      {/* Toast 弹出提示层 */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 glass-panel bg-slate-900 border-cyan-500/30 text-cyan-400 px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-bounce">
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* 顶部通栏 Header */}
      <header className="border-b border-slate-900 bg-slate-900/40 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
              🐳 DockerCrafter Workspace v1.0
            </h1>
            <p className="text-slate-400 text-xs mt-1 font-mono">
              智能工作区模式：已自动聚合本地 Compose 项目与独立容器 • 最后同步：{lastUpdated || "同步中..."}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
            <span className="text-slate-300">Backend Status: Online (Go 1.26)</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 mt-8">
        
        {/* 系统健康与概览指标卡片组 */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="glass-panel rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-medium">应用工作区</span>
              <h3 className="text-2xl font-bold mt-1 text-indigo-400">{stats.totalWorkspaces}</h3>
            </div>
            <div className="p-2.5 bg-indigo-500/10 rounded-lg text-indigo-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
          </div>

          <div className="glass-panel rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium">容器总数</span>
                <h3 className="text-2xl font-bold mt-1">{stats.totalContainers}</h3>
              </div>
              <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
            </div>
            {stats.totalContainers > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>运行中 ({stats.runningContainers})</span>
                  <span>已停止 ({stats.stoppedContainers})</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                  <div className="bg-emerald-500 h-full" style={{ width: `${(stats.runningContainers / stats.totalContainers) * 100}%` }}></div>
                  <div className="bg-rose-500 h-full" style={{ width: `${(stats.stoppedContainers / stats.totalContainers) * 100}%` }}></div>
                </div>
              </div>
            )}
          </div>

          <div className="glass-panel rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium">总 CPU 开销</span>
                <h3 className="text-2xl font-bold mt-1 text-cyan-400">{stats.totalCPU.toFixed(1)}%</h3>
              </div>
              <div className="p-2.5 bg-cyan-500/10 rounded-lg text-cyan-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            {stats.totalContainers > 0 && (
              <div className="mt-3">
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-cyan-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(stats.totalCPU, 100)}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          <div className="glass-panel rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium">运行内存开销</span>
                <h3 className="text-2xl font-bold mt-1 text-purple-400">{formatBytes(stats.totalMemory)}</h3>
              </div>
              <div className="p-2.5 bg-purple-500/10 rounded-lg text-purple-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
            </div>
            {stats.totalContainers > 0 && (
              <div className="mt-3">
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-purple-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min((stats.totalMemory / (4 * 1024 * 1024 * 1024)) * 100, 100)}%` }} // 假定4G为满载
                  ></div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 过滤、搜索、排序操作面板 */}
        <section className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 mb-8 flex flex-col lg:flex-row gap-4 items-center justify-between">
          
          {/* 搜索框 */}
          <div className="relative w-full lg:w-96">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="搜索工作区、容器名称、镜像..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l18 18" />
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
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${statusFilter === "all" ? "bg-slate-800 text-slate-100 shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
              >
                全部
              </button>
              <button 
                onClick={() => setStatusFilter("running")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${statusFilter === "running" ? "bg-emerald-950/50 text-emerald-400 shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
              >
                运行中
              </button>
              <button 
                onClick={() => setStatusFilter("stopped")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${statusFilter === "stopped" ? "bg-rose-950/50 text-rose-400 shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
              >
                已停止
              </button>
            </div>

            {/* 按部署模式过滤 */}
            <div className="flex items-center bg-slate-950 border border-slate-800 p-0.5 rounded-lg">
              <button 
                onClick={() => setTypeFilter("all")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${typeFilter === "all" ? "bg-slate-800 text-slate-100 shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
              >
                全部模式
              </button>
              <button 
                onClick={() => setTypeFilter("compose")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${typeFilter === "compose" ? "bg-indigo-950/50 text-indigo-400 shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
              >
                Compose
              </button>
              <button 
                onClick={() => setTypeFilter("standalone")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${typeFilter === "standalone" ? "bg-slate-800 text-slate-200 shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
              >
                独立容器
              </button>
            </div>

            {/* 排序筛选 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">排序:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="name">工作区名称</option>
                <option value="containers">容器数量</option>
                <option value="cpu">CPU 负荷</option>
                <option value="memory">内存消耗</option>
              </select>
            </div>

          </div>
        </section>

        {/* 项目/工作区看板列表 */}
        {processedWorkspaces.length === 0 ? (
          <div className="glass-panel rounded-2xl p-16 text-center text-slate-500">
            <svg className="mx-auto h-12 w-12 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-base font-medium text-slate-400">没有找到匹配的工作区或容器</p>
            <p className="text-xs text-slate-600 mt-1">请尝试清除搜索关键字或重置过滤器选项</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {processedWorkspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.projectName}
                workspace={workspace}
                isCollapsed={!!collapsedWorkspaces[workspace.projectName]}
                onToggleCollapse={() => toggleCollapse(workspace.projectName)}
                onBatchStart={(name) => showToast(`批量启动命令已发送至工作区：${name}`)}
                onBatchStop={(name) => showToast(`批量停止命令已发送至工作区：${name}`)}
                onContainerStart={(name) => showToast(`已向容器 ${name} 发送启动 (Start) 指令`)}
                onContainerStop={(name) => showToast(`已向容器 ${name} 发送停止 (Stop) 指令`)}
                onContainerRestart={(name) => showToast(`已向容器 ${name} 发送重启 (Restart) 指令`)}
                onContainerLogs={() => showToast(`提示：在前端启用控制与指令自动化相关功能，需要同时将后端 API 升级。请连接控制后端。`)}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

