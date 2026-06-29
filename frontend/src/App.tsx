import { useEffect, useState } from "react";
import type { ProjectWorkspace } from './types';

export default function App() {
  const [workspaces, setWorkspaces] = useState<ProjectWorkspace[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. 轮询拉取后端的工业级监控数据
  const fetchData = () => {
    fetch("http://localhost:12581/api/projects")
      .then((res) => res.json())
      .then((data) => {
        setWorkspaces(data || []);
        setLoading(false);
      })
      .catch((err) => console.error("❌ 无法连接到 Go 后端: ", err));
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 3000); // 每 3 秒自动刷新一次水线指标
    return () => clearInterval(timer);
  }, []);

  // 辅助函数：格式化内存字节数
  const formatMemory = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-400 animate-pulse">
        正在扫描本地 Docker 拓扑空间...
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8 border-b border-zinc-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            🐳 Docker Dev Panel{" "}
            <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 font-normal">
              v2.0 Beta
            </span>
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            智能工作区模式：已自动聚合本地 Compose 项目与独立容器
          </p>
        </div>
        <div className="text-right text-xs text-zinc-500">
          后端状态:{" "}
          <span className="text-emerald-400">● Connected (Go 1.26)</span>
        </div>
      </header>

      {/* 看板网格布局 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workspaces.map((workspace) => (
          <div
            key={workspace.projectName}
            className="border border-zinc-800 bg-zinc-900/50 backdrop-blur rounded-xl p-5 shadow-xl hover:border-zinc-700 transition-all flex flex-col justify-between"
          >
            <div>
              {/* 卡片头部：项目/工作区名称 */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-zinc-200 truncate max-w-[70%]">
                  📂 {workspace.projectName}
                </h2>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-mono ${workspace.isCompose ? "bg-indigo-950 text-indigo-400" : "bg-zinc-800 text-zinc-400"}`}
                >
                  {workspace.isCompose ? "Compose" : "Standalone"}
                </span>
              </div>

              {/* 工作区内的容器列表 */}
              <div className="space-y-3">
                {workspace.containers.map((container) => {
                  const isRunning = container.state === "running";
                  return (
                    <div
                      key={container.id}
                      className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-900 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-zinc-300 truncate max-w-[70%]">
                          {container.name}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase ${isRunning ? "bg-emerald-950/80 text-emerald-400" : "bg-red-950/80 text-red-400"}`}
                        >
                          {container.state}
                        </span>
                      </div>

                      {/* 极简实时水线展示 */}
                      {isRunning && (
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500 bg-zinc-900/30 p-1.5 rounded">
                          <div>
                            CPU:{" "}
                            <span className="text-cyan-400 font-mono">
                              {container.cpuUsage.toFixed(1)}%
                            </span>
                          </div>
                          <div className="truncate">
                            MEM:{" "}
                            <span className="text-purple-400 font-mono">
                              {formatMemory(container.memoryUsage)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 映射端口展示，支持一键点击打开网页 */}
                      {container.ports && container.ports.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {container.ports.map((port) => {
                            const publicPort = port.split(":")[0];
                            return (
                              <button
                                key={port}
                                onClick={() =>
                                  window.open(`http://localhost:${publicPort}`)
                                }
                                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                                title="点击跳转访问"
                              >
                                🔗 {port}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 卡片底部的极简统计 */}
            <div className="mt-4 pt-3 border-t border-zinc-900 text-xs text-zinc-500 flex justify-between items-center">
              <span>共 {workspace.containers.length} 个服务</span>
              {workspace.engineName && (
                <span className="text-cyan-500 font-mono text-[10px] bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-900/30">
                  ⚙️ {workspace.engineName}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
