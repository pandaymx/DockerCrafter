package db

import (
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"docker-dev-panel/config"
	"docker-dev-panel/logger"
	"docker-dev-panel/models"
)

var DB *gorm.DB

// InitDB initializes the SQLite database
func InitDB(cfg *config.Config) {
	if cfg.DBPath == "" {
		logger.Fatalf("数据库路径不能为空")
	}

	// 确保数据库文件所在的目录存在
	dbDir := filepath.Dir(cfg.DBPath)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		logger.Fatalf("无法创建数据库目录: %v", err)
	}

	// 连接 SQLite 数据库 (使用 pure Go driver)
	var err error
	DB, err = gorm.Open(sqlite.Open(cfg.DBPath), &gorm.Config{})
	if err != nil {
		logger.Fatalf("连接数据库失败: %v", err)
	}

	logger.Infof("成功连接到 SQLite 数据库: %s", cfg.DBPath)

	// 自动迁移模型
	err = DB.AutoMigrate(&models.Workspace{}, &models.ContainerMeta{})
	if err != nil {
		logger.Fatalf("自动迁移数据库失败: %v", err)
	}

	logger.Infof("数据库模型自动迁移完成")
}
