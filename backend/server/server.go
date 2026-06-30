package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"

	"docker-dev-panel/config"
	"docker-dev-panel/logger"
	"docker-dev-panel/service"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for dev/panel
		return true
	},
}

// Server 封装了应用服务器的 HTTP 路由和处理程序
type Server struct {
	cfg           *config.Config
	dockerService *service.DockerService
}

// NewServer 创建并初始化一个 Server 实例
func NewServer(cfg *config.Config, dockerService *service.DockerService) *Server {
	return &Server{
		cfg:           cfg,
		dockerService: dockerService,
	}
}

// corsMiddleware 处理动态 CORS 反射
func (s *Server) corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowedOrigins := strings.Split(s.cfg.CORS.AllowOrigin, ",")

		isAllowed := false
		for _, o := range allowedOrigins {
			trimmed := strings.TrimSpace(o)
			if trimmed == "*" || trimmed == origin {
				isAllowed = true
				break
			}
		}

		// 如果匹配成功，动态返回该 Origin；如果不匹配则不返回跨域头
		if isAllowed && origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", s.cfg.CORS.AllowMethods)
			w.Header().Set("Access-Control-Allow-Headers", s.cfg.CORS.AllowHeaders)
			w.Header().Set("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			if isAllowed {
				w.WriteHeader(http.StatusOK)
			} else {
				w.WriteHeader(http.StatusForbidden)
			}
			return
		}

		next(w, r)
	}
}

// Start 注册路由并启动 HTTP 服务器监听
func (s *Server) Start() error {
	// 注册路由处理器
	http.HandleFunc("/api/health", s.corsMiddleware(s.handleHealth))
	http.HandleFunc("/api/projects", s.corsMiddleware(s.handleProjects))
	http.HandleFunc("/api/containers/action", s.corsMiddleware(s.handleContainerAction))
	http.HandleFunc("/api/containers/logs", s.corsMiddleware(s.handleContainerLogs))
	http.HandleFunc("/api/containers/logs/ws", s.corsMiddleware(s.handleContainerLogsWS))
	http.HandleFunc("/api/containers/exec", s.corsMiddleware(s.handleContainerExec))
	http.HandleFunc("/api/containers/exec/ws", s.corsMiddleware(s.handleContainerExecWS))

	addr := ":" + s.cfg.Port
	logger.Infof("🚀 后端服务已启动，监听地址为 http://localhost%s (日志级别: %s)", addr, s.cfg.LogLevel)
	logger.Infof("🔍 API 接口地址: http://localhost%s/api/projects", addr)
	logger.Infof("🏥 健康检查地址: http://localhost%s/api/health", addr)

	return http.ListenAndServe(addr, nil)
}

// handleHealth 健康检查端点
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	logger.Debugf("收到健康检查请求来自: %s", r.RemoteAddr)

	dockerStatus := "disconnected"
	if s.dockerService.Ping(r.Context()) {
		dockerStatus = "connected"
	}

	response := map[string]string{
		"status": "up",
		"docker": dockerStatus,
	}

	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(response); err != nil {
		logger.Errorf("健康检查 JSON 编码失败: %v", err)
	}
}

// handleProjects 项目工作区列表端点
func (s *Server) handleProjects(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "仅支持 GET 请求", http.StatusMethodNotAllowed)
		return
	}

	logger.Debugf("收到项目工作区列表请求来自: %s", r.RemoteAddr)

	// 获取项目工作区数据
	workspaces, err := s.dockerService.GetProjectWorkspaces(r.Context())
	if err != nil {
		logger.Errorf("获取项目工作区失败: %v", err)
		http.Error(w, fmt.Sprintf("获取数据失败: %v", err), http.StatusInternalServerError)
		return
	}

	// 序列化并返回
	if err := json.NewEncoder(w).Encode(workspaces); err != nil {
		logger.Errorf("JSON 编码失败: %v", err)
	}
}

// handleContainerAction 执行容器启动、停止或重启操作
func (s *Server) handleContainerAction(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "POST" {
		http.Error(w, "仅支持 POST 请求", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ID     string `json:"id"`
		Action string `json:"action"` // start, stop, restart
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "无效的 JSON 请求体", http.StatusBadRequest)
		return
	}

	if req.ID == "" || req.Action == "" {
		http.Error(w, "缺少必要参数 id 或 action", http.StatusBadRequest)
		return
	}

	logger.Infof("执行容器操作: id=%s, action=%s", req.ID, req.Action)

	err := s.dockerService.ContainerAction(r.Context(), req.ID, req.Action)
	if err != nil {
		logger.Errorf("容器操作失败: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// handleContainerLogs 获取容器日志
func (s *Server) handleContainerLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "仅支持 GET 请求", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Query().Get("id")
	tail := r.URL.Query().Get("tail")
	if id == "" {
		http.Error(w, "缺少必要参数 id", http.StatusBadRequest)
		return
	}
	if tail == "" {
		tail = "100" // 默认返回 100 行日志
	}

	logger.Debugf("获取容器日志: id=%s, tail=%s", id, tail)

	logs, err := s.dockerService.ContainerLogs(r.Context(), id, tail)
	if err != nil {
		logger.Errorf("获取容器日志失败: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"logs": logs})
}

// handleContainerExec 在容器内执行命令
func (s *Server) handleContainerExec(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "POST" {
		http.Error(w, "仅支持 POST 请求", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ID  string   `json:"id"`
		Cmd []string `json:"cmd"` // 比如 ["ls", "-la"]
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "无效的 JSON 请求体", http.StatusBadRequest)
		return
	}

	if req.ID == "" || len(req.Cmd) == 0 {
		http.Error(w, "缺少必要参数 id 或 cmd", http.StatusBadRequest)
		return
	}

	logger.Infof("执行容器内命令: id=%s, cmd=%v", req.ID, req.Cmd)

	stdout, stderr, exitCode, err := s.dockerService.ContainerExec(r.Context(), req.ID, req.Cmd)
	if err != nil {
		logger.Errorf("容器执行命令失败: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"stdout":   stdout,
		"stderr":   stderr,
		"exitCode": exitCode,
	})
}

// handleContainerExecWS 通过 WebSocket 提供容器终端
func (s *Server) handleContainerExecWS(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "缺少必要参数 id", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Errorf("WebSocket 升级失败: %v", err)
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	logger.Debugf("开始通过 WebSocket 开启容器终端: id=%s", id)

	err = s.dockerService.ContainerExecWS(ctx, id, conn)
	if err != nil {
		logger.Errorf("容器终端 Stream 错误: %v", err)
		conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Error: %v", err)))
	}
}

// handleContainerLogsWS 通过 WebSocket 实时推送容器日志
func (s *Server) handleContainerLogsWS(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	tail := r.URL.Query().Get("tail")
	if id == "" {
		http.Error(w, "缺少必要参数 id", http.StatusBadRequest)
		return
	}
	if tail == "" {
		tail = "100"
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Errorf("WebSocket 升级失败: %v", err)
		return
	}
	defer conn.Close()

	// Start a goroutine to continuously read messages.
	// This is necessary so the underlying connection can process control frames
	// like ping/pong and close frames, and we can detect client disconnections
	// to avoid leaking goroutines and log streams.
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				cancel()
				return
			}
		}
	}()

	logger.Debugf("开始通过 WebSocket 获取容器日志: id=%s, tail=%s", id, tail)

	err = s.dockerService.ContainerLogsStream(ctx, id, tail, conn)
	if err != nil {
		logger.Errorf("容器日志 Stream 错误: %v", err)
		// Try to send error to client before closing
		conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Error: %v", err)))
	}
}
