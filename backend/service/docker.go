package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/moby/moby/client"
	"docker-dev-panel/models"
)

// DockerService 封装 Docker SDK 操作和服务
type DockerService struct {
	cli *client.Client
}

// NewDockerService 创建一个 DockerService 实例
func NewDockerService(cli *client.Client) *DockerService {
	return &DockerService{cli: cli}
}

// DockerStats 用于解析 Docker API 返回的容器监控指标 JSON
type DockerStats struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs  uint32 `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64            `json:"usage"`
		Limit uint64            `json:"limit"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
}

// calculateCPUPercent 计算容器的 CPU 使用百分比
func calculateCPUPercent(stats *DockerStats) float64 {
	cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage) - float64(stats.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(stats.CPUStats.SystemUsage) - float64(stats.PreCPUStats.SystemUsage)

	if systemDelta > 0.0 && cpuDelta > 0.0 {
		onlineCPUs := float64(stats.CPUStats.OnlineCPUs)
		if onlineCPUs == 0 {
			onlineCPUs = 1.0
		}
		return (cpuDelta / systemDelta) * onlineCPUs * 100.0
	}
	return 0.0
}

// calculateMemoryUsage 计算容器的内存实际使用量 (扣除 Cache)
func calculateMemoryUsage(stats *DockerStats) int64 {
	var cache uint64
	if stats.MemoryStats.Stats != nil {
		if val, ok := stats.MemoryStats.Stats["inactive_file"]; ok {
			cache = val
		} else if val, ok := stats.MemoryStats.Stats["cache"]; ok {
			cache = val
		}
	}
	usage := stats.MemoryStats.Usage
	if usage > cache {
		return int64(usage - cache)
	}
	return int64(usage)
}

// fetchContainerStats 异步抓取单个容器的性能指标
func (s *DockerService) fetchContainerStats(ctx context.Context, containerID string) (float64, int64, error) {
	// 设置 2 秒超时以防 Docker 守护进程无响应
	ctxTimeout, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	resp, err := s.cli.ContainerStats(ctxTimeout, containerID, client.ContainerStatsOptions{
		Stream:                false,
		IncludePreviousSample: true,
	})
	if err != nil {
		return 0, 0, err
	}
	defer resp.Body.Close()

	var stats DockerStats
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		if err == io.EOF {
			return 0, 0, nil
		}
		return 0, 0, err
	}

	cpuPercent := calculateCPUPercent(&stats)
	memUsage := calculateMemoryUsage(&stats)

	return cpuPercent, memUsage, nil
}

// containerStatsResult 保存并发抓取的结果
type containerStatsResult struct {
	cpuUsage    float64
	memoryUsage int64
}

// fetchAllContainerStats 并发抓取所有容器的指标
func (s *DockerService) fetchAllContainerStats(ctx context.Context, containerIDs []string) map[string]containerStatsResult {
	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make(map[string]containerStatsResult)

	for _, id := range containerIDs {
		wg.Add(1)
		go func(containerID string) {
			defer wg.Done()
			cpu, mem, err := s.fetchContainerStats(ctx, containerID)
			if err != nil {
				log.Printf("⚠️ 抓取容器 [%s] 监控指标失败: %v", containerID, err)
				return
			}
			mu.Lock()
			results[containerID] = containerStatsResult{
				cpuUsage:    cpu,
				memoryUsage: mem,
			}
			mu.Unlock()
		}(id)
	}

	wg.Wait()
	return results
}

// GetProjectWorkspaces 获取所有的项目工作区和容器信息
func (s *DockerService) GetProjectWorkspaces(ctx context.Context) ([]models.ProjectWorkspace, error) {
	// 1. 获取本地所有的容器列表
	rawContainers, err := s.cli.ContainerList(ctx, client.ContainerListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("无法获取容器列表: %w", err)
	}

	// 2. 收集正在运行的容器 ID 用于性能指标抓取
	var runningIDs []string
	for _, c := range rawContainers.Items {
		if strings.ToLower(string(c.State)) == "running" {
			runningIDs = append(runningIDs, c.ID)
		}
	}

	// 3. 并发抓取性能指标
	statsMap := s.fetchAllContainerStats(ctx, runningIDs)

	// 4. 解析、格式化容器并归组到 Workspace 映射中
	workspaceMap := make(map[string]*models.ProjectWorkspace)
	var standaloneWorkspace *models.ProjectWorkspace

	for _, c := range rawContainers.Items {
		// 格式化容器名称（去掉开头的斜杠）
		name := "未知"
		if len(c.Names) > 0 {
			name = c.Names[0]
			if name[0] == '/' {
				name = name[1:]
			}
		}

		// 格式化端口，去重
		portSet := make(map[string]bool)
		var ports []string
		for _, p := range c.Ports {
			if p.PublicPort != 0 {
				portStr := fmt.Sprintf("%d:%d", p.PublicPort, p.PrivatePort)
				if !portSet[portStr] {
					portSet[portStr] = true
					ports = append(ports, portStr)
				}
			}
		}

		// 从并发收集到的 statsMap 中读取指标数据
		var cpuUsage float64
		var memUsage int64
		if stats, exists := statsMap[c.ID]; exists {
			cpuUsage = stats.cpuUsage
			memUsage = stats.memoryUsage
		}

		info := models.ContainerInfo{
			ID:          c.ID,
			Name:        name,
			Image:       c.Image,
			State:       string(c.State),
			Status:      c.Status,
			Ports:       ports,
			Labels:      c.Labels,
			CpuUsage:    cpuUsage,
			MemoryUsage: memUsage,
		}

		// 智能编排分组
		composeProject := c.Labels["com.docker.compose.project"]
		if composeProject != "" {
			// Compose 项目
			ws, exists := workspaceMap[composeProject]
			if !exists {
				ws = &models.ProjectWorkspace{
					ProjectName: composeProject,
					IsCompose:   true,
					Containers:  []models.ContainerInfo{},
				}
				workspaceMap[composeProject] = ws
			}
			ws.Containers = append(ws.Containers, info)
		} else {
			// 独立容器
			if standaloneWorkspace == nil {
				standaloneWorkspace = &models.ProjectWorkspace{
					ProjectName: "独立容器（未归组）",
					IsCompose:   false,
					Containers:  []models.ContainerInfo{},
				}
			}
			standaloneWorkspace.Containers = append(standaloneWorkspace.Containers, info)
		}
	}

	// 5. 组装最终 slice 返回
	var workspaces []models.ProjectWorkspace
	for _, ws := range workspaceMap {
		workspaces = append(workspaces, *ws)
	}
	if standaloneWorkspace != nil {
		workspaces = append(workspaces, *standaloneWorkspace)
	}

	return workspaces, nil
}
