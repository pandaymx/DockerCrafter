package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/moby/moby/client"
	"docker-dev-panel/config"
	"docker-dev-panel/models"
)

// DockerClientInfo 存储每个 Docker 客户端实例和别名
type DockerClientInfo struct {
	Name string
	Cli  *client.Client
}

// DockerService 封装了多个 Docker 守护进程的连接和操作
type DockerService struct {
	clients []DockerClientInfo
}

// NewDockerService 创建并初始化多个 Docker 客户端连接
func NewDockerService(engineConfigs []config.DockerEngineConfig) (*DockerService, error) {
	var clients []DockerClientInfo

	for _, ec := range engineConfigs {
		var opts []client.Opt

		if ec.Host == "" {
			// 本地 Docker，使用 FromEnv 自动探测
			opts = append(opts, client.FromEnv)
		} else {
			// 远程 Docker
			opts = append(opts, client.WithHost(ec.Host))

			// TLS 加密支持
			if ec.TLSVerify && ec.CertPath != "" {
				caFile := filepath.Join(ec.CertPath, "ca.pem")
				certFile := filepath.Join(ec.CertPath, "cert.pem")
				keyFile := filepath.Join(ec.CertPath, "key.pem")
				opts = append(opts, client.WithTLSClientConfig(caFile, certFile, keyFile))
			}
		}

		opts = append(opts, client.WithAPIVersionNegotiation())

		cli, err := client.NewClientWithOpts(opts...)
		if err != nil {
			log.Printf("⚠️ 警告：连接 Docker 实例 [%s] 失败: %v", ec.Name, err)
			continue
		}

		clients = append(clients, DockerClientInfo{
			Name: ec.Name,
			Cli:  cli,
		})
	}

	if len(clients) == 0 {
		return nil, fmt.Errorf("没有成功初始化任何 Docker 引擎连接")
	}

	return &DockerService{clients: clients}, nil
}

// Close 关闭所有的 Docker 客户端连接
func (s *DockerService) Close() {
	for _, c := range s.clients {
		if err := c.Cli.Close(); err != nil {
			log.Printf("⚠️ 关闭 Docker 实例 [%s] 客户端连接失败: %v", c.Name, err)
		}
	}
}

// Ping 尝试 Ping 所有已连接的 Docker 引擎，只要有任意一个返回成功即返回 true
func (s *DockerService) Ping(ctx context.Context) bool {
	var wg sync.WaitGroup
	var once sync.Once
	connected := false

	for _, c := range s.clients {
		wg.Add(1)
		go func(cli *client.Client) {
			defer wg.Done()
			pingCtx, cancel := context.WithTimeout(ctx, 1*time.Second)
			defer cancel()

			if _, err := cli.Ping(pingCtx, client.PingOptions{}); err == nil {
				once.Do(func() {
					connected = true
				})
			}
		}(c.Cli)
	}

	wg.Wait()
	return connected
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
func (s *DockerService) fetchContainerStats(ctx context.Context, cli *client.Client, containerID string) (float64, int64, error) {
	// 设置 2 秒超时以防 Docker 守护进程无响应
	ctxTimeout, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	resp, err := cli.ContainerStats(ctxTimeout, containerID, client.ContainerStatsOptions{
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
func (s *DockerService) fetchAllContainerStats(ctx context.Context, cli *client.Client, containerIDs []string) map[string]containerStatsResult {
	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make(map[string]containerStatsResult)

	for _, id := range containerIDs {
		wg.Add(1)
		go func(containerID string) {
			defer wg.Done()
			cpu, mem, err := s.fetchContainerStats(ctx, cli, containerID)
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

// GetProjectWorkspaces 获取所有实例下的项目工作区并进行整合
func (s *DockerService) GetProjectWorkspaces(ctx context.Context) ([]models.ProjectWorkspace, error) {
	var wg sync.WaitGroup
	var mu sync.Mutex
	var allWorkspaces []models.ProjectWorkspace

	for _, cInfo := range s.clients {
		wg.Add(1)
		go func(c DockerClientInfo) {
			defer wg.Done()

			// 为单个引擎的请求设置 3 秒的超时以防连接超时挂起整个服务
			engineCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()

			workspaces, err := s.getEngineWorkspaces(engineCtx, c.Cli, c.Name)
			if err != nil {
				log.Printf("⚠️ 获取 Docker 实例 [%s] 容器失败: %v", c.Name, err)
				return
			}

			mu.Lock()
			allWorkspaces = append(allWorkspaces, workspaces...)
			mu.Unlock()
		}(cInfo)
	}

	wg.Wait()
	return allWorkspaces, nil
}

// getEngineWorkspaces 抓取并解析单个 Docker 客户端的容器
func (s *DockerService) getEngineWorkspaces(ctx context.Context, cli *client.Client, engineName string) ([]models.ProjectWorkspace, error) {
	// 1. 获取所有的容器列表
	rawContainers, err := cli.ContainerList(ctx, client.ContainerListOptions{All: true})
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
	statsMap := s.fetchAllContainerStats(ctx, cli, runningIDs)

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
					EngineName:  engineName,
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
					EngineName:  engineName,
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
