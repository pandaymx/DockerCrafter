// src/components/WorkspaceCard.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import {
  FolderGit,
  Package,
  Settings,
  Play,
  Square,
  MapPin,
} from "lucide-react";
import type { ProjectWorkspace } from "../types";
import { ContainerCard } from "./ContainerCard";
import { VirtualContainerList } from "./VirtualContainerList";
import { Button, StatusBadge, GlassPanel } from "./ui";
import { cn } from "../utils/cn";

interface WorkspaceCardProps {
  workspace: ProjectWorkspace;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onBatchStart?: (projectName: string) => void;
  onBatchStop?: (projectName: string) => void;
  onContainerStart?: (id: string, name: string) => void;
  onContainerStop?: (id: string, name: string) => void;
  onContainerRestart?: (id: string, name: string) => void;
  onContainerLogs?: (id: string, name: string) => void;
  onContainerTerminal?: (id: string, name: string) => void;
}

export const WorkspaceCard: React.FC<WorkspaceCardProps> = ({
  workspace,
  isCollapsed = false,
  onToggleCollapse,
  onBatchStart,
  onBatchStop,
  onContainerStart,
  onContainerStop,
  onContainerRestart,
  onContainerLogs,
  onContainerTerminal,
}) => {
  const { t } = useTranslation();
  const totalCount = workspace.containers.length;
  const runningCount = workspace.containers.filter(
    (c) => c.state === "running",
  ).length;

  let workspaceStatus: "running-all" | "running-partial" | "stopped-all" =
    "stopped-all";
  if (runningCount === totalCount && totalCount > 0) {
    workspaceStatus = "running-all";
  } else if (runningCount > 0) {
    workspaceStatus = "running-partial";
  }

  const iconColorClass = cn("transition-all", {
    "text-emerald-500 group-hover:text-emerald-400":
      workspaceStatus === "running-all",
    "text-amber-500 group-hover:text-amber-400":
      workspaceStatus === "running-partial",
    "text-slate-500 group-hover:text-slate-400":
      workspaceStatus === "stopped-all",
  });

  const getStatusText = () => {
    if (workspace.isCompose) {
      if (workspaceStatus === "running-all")
        return t("workspace.status.composeRunning");
      if (workspaceStatus === "running-partial")
        return t("workspace.status.composePartial");
      return t("workspace.status.composeStopped");
    } else {
      if (workspaceStatus === "running-all")
        return t("workspace.status.standaloneRunning");
      if (workspaceStatus === "running-partial")
        return t("workspace.status.standalonePartial");
      return t("workspace.status.standaloneStopped");
    }
  };

  return (
    <GlassPanel className="p-5 flex flex-col justify-between h-full rounded-2xl bg-slate-900/80 border-slate-800">
      <div>
        {/* Workspace header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div
            className="flex items-center gap-2.5 min-w-0 cursor-pointer select-none group"
            onClick={onToggleCollapse}
          >
            <span
              className={cn("shrink-0 group-hover:scale-110", iconColorClass)}
            >
              {workspace.isCompose ? (
                <FolderGit className="w-5 h-5" />
              ) : (
                <Package className="w-5 h-5" />
              )}
            </span>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-100 tracking-wide text-base uppercase font-mono truncate group-hover:text-blue-400 transition-colors">
                {workspace.projectName}
              </h3>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                <span>
                  {t("workspace.services")}: {workspace.containers.length} /{" "}
                  {t("workspace.running")}: {runningCount}
                </span>
                {workspace.engineName && (
                  <span className="flex items-center gap-1 text-cyan-400 bg-cyan-950/20 px-1.5 py-0.5 rounded text-[9px] shrink-0">
                    <Settings className="w-3 h-3" /> {workspace.engineName}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Batch actions */}
            <div className="flex items-center gap-1 bg-slate-950/40 p-0.5 rounded-lg border border-slate-800/40">
              <Button
                variant="icon"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onBatchStart?.(workspace.projectName);
                }}
                title={t("workspace.startAll")}
                className="hover:text-emerald-400 hover:bg-slate-800"
              >
                <Play className="w-4 h-4" />
              </Button>
              <Button
                variant="icon"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onBatchStop?.(workspace.projectName);
                }}
                title={t("workspace.stopAll")}
                className="hover:text-rose-400 hover:bg-slate-800"
              >
                <Square className="w-4 h-4" />
              </Button>
            </div>

            <StatusBadge
              status={workspaceStatus}
              showDot={true}
              className="hidden sm:inline"
            >
              {getStatusText()}
            </StatusBadge>

            {/* Collapse toggle */}
            <Button
              variant="icon"
              size="icon"
              onClick={onToggleCollapse}
              title={
                isCollapsed ? t("workspace.expand") : t("workspace.collapse")
              }
              className="hover:bg-slate-800/50"
            >
              <svg
                width="16"
                height="16"
                className={cn(
                  "h-4 w-4 transform transition-transform duration-200",
                  isCollapsed ? "rotate-90" : "rotate-180",
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </Button>
          </div>
        </div>

        {/* Containers grid list */}
        {!isCollapsed && (
          <VirtualContainerList
            items={workspace.containers}
            itemHeight={240}
            maxHeight={600}
            renderItem={(container) => (
              <ContainerCard
                key={container.id}
                container={container}
                onStart={onContainerStart}
                onStop={onContainerStop}
                onRestart={onContainerRestart}
                onLogs={onContainerLogs}
                onTerminal={onContainerTerminal}
              />
            )}
          />
        )}
      </div>

      {/* Workspace footer */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-4 pt-3 border-t border-slate-800/60">
        <div>
          {t("workspace.totalServices", { count: workspace.containers.length })}
        </div>
        <div className="flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {t("workspace.localEnv")}
        </div>
      </div>
    </GlassPanel>
  );
};
