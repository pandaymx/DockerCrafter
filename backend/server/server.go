package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"docker-dev-panel/config"
	"docker-dev-panel/service"
)

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

// Start 注册路由并启动 HTTP 服务器监听
func (s *Server) Start() error {
	// 注册路由处理器
	http.HandleFunc("/api/health", s.handleHealth)
	http.HandleFunc("/api/projects", s.handleProjects)

	addr := ":" + s.cfg.Port
	log.Printf("🚀 后端服务已启动，监听地址为 http://localhost%s", addr)
	log.Printf("🔍 API 接口地址: http://localhost%s/api/projects", addr)
	log.Printf("🏥 健康检查地址: http://localhost%s/api/health", addr)

	return http.ListenAndServe(addr, nil)
}

// handleHealth 健康检查端点
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", s.cfg.CORS.AllowOrigin)
	w.Header().Set("Access-Control-Allow-Methods", s.cfg.CORS.AllowMethods)
	w.Header().Set("Access-Control-Allow-Headers", s.cfg.CORS.AllowHeaders)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

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
		log.Printf("健康检查 JSON 编码失败: %v", err)
	}
}

// handleProjects 项目工作区列表端点
func (s *Server) handleProjects(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", s.cfg.CORS.AllowOrigin)
	w.Header().Set("Access-Control-Allow-Methods", s.cfg.CORS.AllowMethods)
	w.Header().Set("Access-Control-Allow-Headers", s.cfg.CORS.AllowHeaders)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "仅支持 GET 请求", http.StatusMethodNotAllowed)
		return
	}

	// 获取项目工作区数据
	workspaces, err := s.dockerService.GetProjectWorkspaces(r.Context())
	if err != nil {
		log.Printf("获取项目工作区失败: %v", err)
		http.Error(w, fmt.Sprintf("获取数据失败: %v", err), http.StatusInternalServerError)
		return
	}

	// 序列化并返回
	if err := json.NewEncoder(w).Encode(workspaces); err != nil {
		log.Printf("JSON 编码失败: %v", err)
	}
}
