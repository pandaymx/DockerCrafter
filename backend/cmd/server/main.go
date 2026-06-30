package main

import (
	"context"
	"docker-dev-panel/config"
	"docker-dev-panel/db"
	"docker-dev-panel/logger"
	"docker-dev-panel/server"
	"docker-dev-panel/service"
)

func main() {
	// 1. 加载配置并初始化日志（支持命令行参数 > 环境变量 > 配置文件 > 默认值）
	cfg := config.LoadConfig()

	// 2. 初始化数据库连接及数据表同步
	db.InitDB(cfg)

	// 3. 初始化 Docker 服务（连接所有配置的 Docker 实例）
	dockerService, err := service.NewDockerService(context.Background(), cfg.DockerEngines)
	if err != nil {
		logger.Fatalf("无法连接到任何 Docker 引擎: %v", err)
	}
	defer dockerService.Close()

	// 4. 初始化并启动 Web 服务
	appServer := server.NewServer(cfg, dockerService)
	if err := appServer.Start(); err != nil {
		logger.Fatalf("服务器启动失败: %v", err)
	}
}
