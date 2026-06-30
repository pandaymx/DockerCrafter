package server

import (
	"fmt"
	"net/http"
	"time"

	"docker-dev-panel/config"
	"docker-dev-panel/logger"
	"docker-dev-panel/service"

	"github.com/gin-gonic/gin"
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

// LoggerMiddleware 记录请求日志
func LoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path

		c.Next()

		latency := time.Since(start)
		statusCode := c.Writer.Status()
		clientIP := c.ClientIP()
		method := c.Request.Method

		logger.Infof("[GIN] %3d | %13v | %15s | %-7s %s",
			statusCode,
			latency,
			clientIP,
			method,
			path,
		)
	}
}

// CORSMiddleware 处理全局跨域请求
func CORSMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", cfg.CORS.AllowOrigin)
		c.Writer.Header().Set("Access-Control-Allow-Methods", cfg.CORS.AllowMethods)
		c.Writer.Header().Set("Access-Control-Allow-Headers", cfg.CORS.AllowHeaders)
		c.Writer.Header().Set("Content-Type", "application/json")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}

		c.Next()
	}
}

// Start 注册路由并启动 HTTP 服务器监听
func (s *Server) Start() error {
	// 设置 Gin 模式
	if s.cfg.LogLevel == "debug" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	// 创建不带默认中间件的路由引擎
	r := gin.New()

	// 注册全局中间件
	r.Use(LoggerMiddleware())
	r.Use(gin.Recovery())
	r.Use(CORSMiddleware(s.cfg))

	// 注册 API 路由
	api := r.Group("/api")
	{
		api.GET("/health", s.handleHealth)
		api.GET("/projects", s.handleProjects)
		api.POST("/containers/action", s.handleContainerAction)
		api.GET("/containers/logs", s.handleContainerLogs)
		api.POST("/containers/exec", s.handleContainerExec)
	}

	addr := ":" + s.cfg.Port
	logger.Infof("🚀 后端服务已启动，监听地址为 http://localhost%s (日志级别: %s)", addr, s.cfg.LogLevel)
	logger.Infof("🔍 API 接口地址: http://localhost%s/api/projects", addr)
	logger.Infof("🏥 健康检查地址: http://localhost%s/api/health", addr)

	return r.Run(addr)
}

// handleHealth 健康检查端点
func (s *Server) handleHealth(c *gin.Context) {
	dockerStatus := "disconnected"
	if s.dockerService.Ping(c.Request.Context()) {
		dockerStatus = "connected"
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "up",
		"docker": dockerStatus,
	})
}

// handleProjects 项目工作区列表端点
func (s *Server) handleProjects(c *gin.Context) {
	// 获取项目工作区数据
	workspaces, err := s.dockerService.GetProjectWorkspaces(c.Request.Context())
	if err != nil {
		logger.Errorf("获取项目工作区失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("获取数据失败: %v", err)})
		return
	}

	// 返回结果
	c.JSON(http.StatusOK, workspaces)
}

// handleContainerAction 执行容器启动、停止或重启操作
func (s *Server) handleContainerAction(c *gin.Context) {
	var req struct {
		ID     string `json:"id"`
		Action string `json:"action"` // start, stop, restart
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 JSON 请求体"})
		return
	}

	if req.ID == "" || req.Action == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少必要参数 id 或 action"})
		return
	}

	logger.Infof("执行容器操作: id=%s, action=%s", req.ID, req.Action)

	err := s.dockerService.ContainerAction(c.Request.Context(), req.ID, req.Action)
	if err != nil {
		logger.Errorf("容器操作失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

// handleContainerLogs 获取容器日志
func (s *Server) handleContainerLogs(c *gin.Context) {
	id := c.Query("id")
	tail := c.Query("tail")

	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少必要参数 id"})
		return
	}
	if tail == "" {
		tail = "100" // 默认返回 100 行日志
	}

	logs, err := s.dockerService.ContainerLogs(c.Request.Context(), id, tail)
	if err != nil {
		logger.Errorf("获取容器日志失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

// handleContainerExec 在容器内执行命令
func (s *Server) handleContainerExec(c *gin.Context) {
	var req struct {
		ID  string   `json:"id"`
		Cmd []string `json:"cmd"` // 比如 ["ls", "-la"]
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 JSON 请求体"})
		return
	}

	if req.ID == "" || len(req.Cmd) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少必要参数 id 或 cmd"})
		return
	}

	logger.Infof("执行容器内命令: id=%s, cmd=%v", req.ID, req.Cmd)

	stdout, stderr, exitCode, err := s.dockerService.ContainerExec(c.Request.Context(), req.ID, req.Cmd)
	if err != nil {
		logger.Errorf("容器执行命令失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"stdout":   stdout,
		"stderr":   stderr,
		"exitCode": exitCode,
	})
}
