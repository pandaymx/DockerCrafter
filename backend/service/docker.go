package service

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/moby/moby/client"
	"github.com/moby/moby/api/pkg/stdcopy"
	"docker-dev-panel/config"
	"docker-dev-panel/logger"
	"docker-dev-panel/models"
)

// DockerClientInfo 存储每个 Docker 客户端实例和别名
type DockerClientInfo struct {
	Name string
	Cli  *client.Client
}

const statsRefreshInterval = 2 * time.Second

// DockerService 封装了多个 Docker 守护进程的连接和操作
type DockerService struct {
	clients         []DockerClientInfo
	statsCache      map[string]containerStatsResult
	statsCacheMutex sync.RWMutex
	cancelFunc      context.CancelFunc
}

// NewDockerService 创建并初始化多个 Docker 客户端连接
func NewDockerService(ctx context.Context, engineConfigs []config.DockerEngineConfig) (*DockerService, error) {
	var clients []DockerClientInfo

	for _, ec := range engineConfigs {
		var opts []client.Opt

		if ec.Host == "" {
			// 本地 Docker，使用 FromEnv 自动探测
			opts = append(opts, client.FromEnv)
		} else {
			// 远程 Docker
			host := ec.Host
			// TLS 加密支持
			if ec.TLSVerify {
				if ec.CACertBase64 != "" && ec.ClientCertBase64 != "" && ec.ClientKeyBase64 != "" {
					// 使用内存中的 Base64 证书配置 TLS (现代化无状态方案)
					caCert, err := base64.StdEncoding.DecodeString(ec.CACertBase64)
					if err != nil {
						logger.Warnf("实例 [%s] 的 CA 证书 Base64 解码失败: %v", ec.Name, err)
						continue
					}
					clientCert, err := base64.StdEncoding.DecodeString(ec.ClientCertBase64)
					if err != nil {
						logger.Warnf("实例 [%s] 的 Client 证书 Base64 解码失败: %v", ec.Name, err)
						continue
					}
					clientKey, err := base64.StdEncoding.DecodeString(ec.ClientKeyBase64)
					if err != nil {
						logger.Warnf("实例 [%s] 的 Client 私钥 Base64 解码失败: %v", ec.Name, err)
						continue
					}

					certPool := x509.NewCertPool()
					if !certPool.AppendCertsFromPEM(caCert) {
						logger.Warnf("实例 [%s] 无法从 Base64 解析并追加 CA 证书", ec.Name)
						continue
					}

					cert, err := tls.X509KeyPair(clientCert, clientKey)
					if err != nil {
						logger.Warnf("实例 [%s] 加载客户端证书和私钥失败: %v", ec.Name, err)
						continue
					}

					tlsConfig := &tls.Config{
						RootCAs:      certPool,
						Certificates: []tls.Certificate{cert},
					}

					httpClient := &http.Client{
						Transport: &http.Transport{
							TLSClientConfig: tlsConfig,
						},
					}
					// If we provide a custom HTTP client for TLS, we must update the host scheme to https
					// so the underlying Docker client correctly dials TLS instead of plaintext HTTP.
					if strings.HasPrefix(host, "tcp://") {
						host = strings.Replace(host, "tcp://", "https://", 1)
					} else if !strings.HasPrefix(host, "https://") && !strings.HasPrefix(host, "http://") && !strings.HasPrefix(host, "unix://") && !strings.HasPrefix(host, "npipe://") {
						host = "https://" + host
					}

					opts = append(opts, client.WithHTTPClient(httpClient))
					logger.Infof("实例 [%s] 成功应用内存 Base64 TLS 配置", ec.Name)

				} else if ec.CertPath != "" {
					// 回退到传统的文件路径方案
					caFile := filepath.Join(ec.CertPath, "ca.pem")
					certFile := filepath.Join(ec.CertPath, "cert.pem")
					keyFile := filepath.Join(ec.CertPath, "key.pem")
					opts = append(opts, client.WithTLSClientConfig(caFile, certFile, keyFile))
					logger.Infof("实例 [%s] 使用本地证书文件路径配置 TLS", ec.Name)
				} else {
					logger.Warnf("实例 [%s] 启用了 TLSVerify，但未提供 Base64 证书或证书路径", ec.Name)
				}
			}
			opts = append(opts, client.WithHost(host))
		}

		opts = append(opts, client.WithAPIVersionNegotiation())

		cli, err := client.NewClientWithOpts(opts...)
		if err != nil {
			logger.Warnf("连接 Docker 实例 [%s] 失败: %v", ec.Name, err)
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

	ctx, cancel := context.WithCancel(ctx)
	ds := &DockerService{
		clients:    clients,
		statsCache: make(map[string]containerStatsResult),
		cancelFunc: cancel,
	}

	go ds.startStatsManager(ctx)

	return ds, nil
}

// Close 关闭所有的 Docker 客户端连接
func (s *DockerService) Close() {
	if s.cancelFunc != nil {
		s.cancelFunc()
	}
	for _, c := range s.clients {
		if err := c.Cli.Close(); err != nil {
			logger.Warnf("关闭 Docker 实例 [%s] 客户端连接失败: %v", c.Name, err)
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

// calculateCPUPercent 计算容器 of CPU 使用百分比
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
func (s *DockerService) fetchContainerStats(ctx context.Context, cli *client.Client, containerID string) (float64, int64, int64, error) {
	// 设置 2 秒超时以防 Docker 守护进程无响应
	ctxTimeout, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	resp, err := cli.ContainerStats(ctxTimeout, containerID, client.ContainerStatsOptions{
		Stream:                false,
		IncludePreviousSample: true,
	})
	if err != nil {
		return 0, 0, 0, err
	}
	defer resp.Body.Close()

	var stats DockerStats
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		if err == io.EOF {
			return 0, 0, 0, nil
		}
		return 0, 0, 0, err
	}

	cpuPercent := calculateCPUPercent(&stats)
	memUsage := calculateMemoryUsage(&stats)
	memLimit := int64(stats.MemoryStats.Limit)

	return cpuPercent, memUsage, memLimit, nil
}

// containerStatsResult 保存并发抓取的结果
type containerStatsResult struct {
	cpuUsage    float64
	memoryUsage int64
	memoryLimit int64
}

func (s *DockerService) startStatsManager(ctx context.Context) {
	ticker := time.NewTicker(statsRefreshInterval)
	defer ticker.Stop()

	// Initial fetch
	s.refreshStats(ctx)

	for {
		select {
		case <-ctx.Done():
			logger.Infof("Stats manager stopped")
			return
		case <-ticker.C:
			s.refreshStats(ctx)
		}
	}
}

func (s *DockerService) refreshStats(ctx context.Context) {
	// First, gather all running containers from all clients
	runningContainerIDs := make(map[string]*client.Client)

	// We use a short timeout for listing containers to avoid blocking the ticker loop
	listCtx, cancelList := context.WithTimeout(ctx, 3*time.Second)
	defer cancelList()

	for _, c := range s.clients {
		rawContainers, err := c.Cli.ContainerList(listCtx, client.ContainerListOptions{All: false})
		if err != nil {
			logger.Warnf("定时抓取时无法获取实例 [%s] 容器列表: %v", c.Name, err)
			continue
		}
		for _, cnt := range rawContainers.Items {
			if strings.ToLower(string(cnt.State)) == "running" {
				runningContainerIDs[cnt.ID] = c.Cli
			}
		}
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make(map[string]containerStatsResult)

	for id, cli := range runningContainerIDs {
		wg.Add(1)
		go func(containerID string, dockerCli *client.Client) {
			defer wg.Done()
			cpu, mem, limit, err := s.fetchContainerStats(ctx, dockerCli, containerID)
			if err != nil {
				// 发生错误时，记录日志并默认资源使用为 0
				logger.Debugf("抓取容器 [%s] 监控指标失败 (可能正在停止): %v", containerID, err)
				cpu = 0.0
				mem = 0
				limit = 0
			}
			mu.Lock()
			results[containerID] = containerStatsResult{
				cpuUsage:    cpu,
				memoryUsage: mem,
				memoryLimit: limit,
			}
			mu.Unlock()
		}(id, cli)
	}

	wg.Wait()

	s.statsCacheMutex.Lock()
	defer s.statsCacheMutex.Unlock()

	// 清理已经不在 running 状态的容器缓存
	for cachedID := range s.statsCache {
		if _, stillRunning := runningContainerIDs[cachedID]; !stillRunning {
			delete(s.statsCache, cachedID)
		}
	}

	// 更新抓取到的最新指标
	for id, stats := range results {
		s.statsCache[id] = stats
	}
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
				logger.Warnf("获取 Docker 实例 [%s] 容器失败: %v", c.Name, err)
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

	// 2. 解析、格式化容器并归组到 Workspace 映射中
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

		// 从缓存中读取指标数据
		var cpuUsage float64
		var memUsage int64
		var memLimit int64
		s.statsCacheMutex.RLock()
		if stats, exists := s.statsCache[c.ID]; exists {
			cpuUsage = stats.cpuUsage
			memUsage = stats.memoryUsage
			memLimit = stats.memoryLimit
		}
		s.statsCacheMutex.RUnlock()

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
			MemoryLimit: memLimit,
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

	// 3. 组装最终 slice 返回
	var workspaces []models.ProjectWorkspace
	for _, ws := range workspaceMap {
		workspaces = append(workspaces, *ws)
	}
	if standaloneWorkspace != nil {
		workspaces = append(workspaces, *standaloneWorkspace)
	}

	return workspaces, nil
}

// ContainerAction 执行容器操作 (start, stop, restart)
func (s *DockerService) ContainerAction(ctx context.Context, id string, action string) error {
	for _, clientInfo := range s.clients {
		_, err := clientInfo.Cli.ContainerInspect(ctx, id, client.ContainerInspectOptions{})
		if err == nil {
			switch action {
			case "start":
				_, err = clientInfo.Cli.ContainerStart(ctx, id, client.ContainerStartOptions{})
				return err
			case "stop":
				_, err = clientInfo.Cli.ContainerStop(ctx, id, client.ContainerStopOptions{})
				return err
			case "restart":
				_, err = clientInfo.Cli.ContainerRestart(ctx, id, client.ContainerRestartOptions{})
				return err
			default:
				return fmt.Errorf("不支持的容器操作: %s", action)
			}
		}
	}
	return fmt.Errorf("未找到容器: %s", id)
}

// ContainerLogs 获取容器日志内容
func (s *DockerService) ContainerLogs(ctx context.Context, id string, tail string) (string, error) {
	for _, clientInfo := range s.clients {
		inspect, err := clientInfo.Cli.ContainerInspect(ctx, id, client.ContainerInspectOptions{})
		if err == nil {
			reader, err := clientInfo.Cli.ContainerLogs(ctx, id, client.ContainerLogsOptions{
				ShowStdout: true,
				ShowStderr: true,
				Tail:       tail,
				Timestamps: false,
			})
			if err != nil {
				return "", err
			}
			defer reader.Close()

			if inspect.Container.Config.Tty {
				var buf strings.Builder
				_, err = io.Copy(&buf, reader)
				if err != nil && err != io.EOF {
					return "", err
				}
				return buf.String(), nil
			} else {
				var stdoutBuf bytes.Buffer
				var stderrBuf bytes.Buffer
				_, err = stdcopy.StdCopy(&stdoutBuf, &stderrBuf, reader)
				if err != nil && err != io.EOF {
					// Fallback to direct copy if stdcopy returns error
					var fallbackBuf strings.Builder
					_, _ = io.Copy(&fallbackBuf, reader)
					return fallbackBuf.String(), nil
				}
				combined := stdoutBuf.String()
				if stderrBuf.Len() > 0 {
					combined += "\n--- STDERR ---\n" + stderrBuf.String()
				}
				return combined, nil
			}
		}
	}
	return "", fmt.Errorf("未找到容器: %s", id)
}

// ContainerExec 在指定容器中执行命令并返回结果
func (s *DockerService) ContainerExec(ctx context.Context, id string, cmd []string) (string, string, int, error) {
	for _, clientInfo := range s.clients {
		_, err := clientInfo.Cli.ContainerInspect(ctx, id, client.ContainerInspectOptions{})
		if err == nil {
			execConfig := client.ExecCreateOptions{
				Cmd:          cmd,
				AttachStdout: true,
				AttachStderr: true,
			}
			execID, err := clientInfo.Cli.ExecCreate(ctx, id, execConfig)
			if err != nil {
				return "", "", 0, err
			}

			resp, err := clientInfo.Cli.ExecAttach(ctx, execID.ID, client.ExecAttachOptions{})
			if err != nil {
				return "", "", 0, err
			}
			defer resp.Close()

			var stdoutBuf bytes.Buffer
			var stderrBuf bytes.Buffer
			_, err = stdcopy.StdCopy(&stdoutBuf, &stderrBuf, resp.Reader)
			if err != nil && err != io.EOF {
				// ignore error
			}

			inspectResp, err := clientInfo.Cli.ExecInspect(ctx, execID.ID, client.ExecInspectOptions{})
			exitCode := 0
			if err == nil {
				exitCode = inspectResp.ExitCode
			}

			return stdoutBuf.String(), stderrBuf.String(), exitCode, nil
		}
	}
	return "", "", 0, fmt.Errorf("未找到容器: %s", id)
}


// ContainerLogsStream 实时获取并流式返回容器日志内容
func (s *DockerService) ContainerLogsStream(ctx context.Context, id string, tail string, conn interface { WriteMessage(messageType int, data []byte) error }) error {
	for _, clientInfo := range s.clients {
		inspect, err := clientInfo.Cli.ContainerInspect(ctx, id, client.ContainerInspectOptions{})
		if err == nil {
			reader, err := clientInfo.Cli.ContainerLogs(ctx, id, client.ContainerLogsOptions{
				ShowStdout: true,
				ShowStderr: true,
				Tail:       tail,
				Follow:     true,
				Timestamps: false,
			})
			if err != nil {
				return err
			}
			defer reader.Close()

			// Start a goroutine to wait for context cancellation and close reader
			go func() {
				<-ctx.Done()
				reader.Close()
			}()

			// We need websocket package but it's not imported in service.
			// Let's pass an interface that has WriteMessage(int, []byte) error to avoid cyclical dependencies or importing websocket here if unnecessary.
			// 1 == websocket.TextMessage

			if inspect.Container.Config.Tty {
				buf := make([]byte, 4096)
				for {
					n, err := reader.Read(buf)
					if n > 0 {
						if writeErr := conn.WriteMessage(1, buf[:n]); writeErr != nil {
							return writeErr
						}
					}
					if err != nil {
						if err == io.EOF {
							return nil
						}
						return err
					}
				}
			} else {
				// Use docker's stdcopy to demultiplex stdout and stderr
				// StdCopy writes to io.Writer. We can create a custom writer that wraps the conn.WriteMessage.

				stdoutWriter := &WSWriter{conn: conn}
				stderrWriter := &WSWriter{conn: conn} // Could format differently if needed

				_, err = stdcopy.StdCopy(stdoutWriter, stderrWriter, reader)
				if err != nil && err != io.EOF {
					return err
				}
				return nil
			}
		}
	}
	return fmt.Errorf("未找到容器: %s", id)
}

// WSWriter wraps a websocket connection to implement io.Writer
type WSWriter struct {
	conn interface { WriteMessage(messageType int, data []byte) error }
}

// Write implements io.Writer for WSWriter
func (w *WSWriter) Write(p []byte) (n int, err error) {
	err = w.conn.WriteMessage(1, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}
