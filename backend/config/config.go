package config

import (
	"flag"
	"os"

	"gopkg.in/yaml.v3"
)

// Config 保存应用程序的配置信息
type Config struct {
	Port string `yaml:"port"`
}

// LoadConfig 级联加载配置，优先级为：
// 命令行参数 (-port) > 环境变量 (PORT) > 配置文件 (config.yaml) > 默认值 (8080)
func LoadConfig() *Config {
	// 1. 设置默认值
	resolvedPort := "12581"

	// 2. 尝试从 YAML 配置文件中读取
	configFile := "config.yaml"
	if yamlData, err := os.ReadFile(configFile); err == nil {
		var yamlCfg Config
		if err := yaml.Unmarshal(yamlData, &yamlCfg); err == nil {
			if yamlCfg.Port != "" {
				resolvedPort = yamlCfg.Port
			}
		}
	}

	// 3. 尝试从环境变量读取并覆盖
	if envPort := os.Getenv("PORT"); envPort != "" {
		resolvedPort = envPort
	}

	// 4. 尝试从命令行参数读取并覆盖
	var flagPort string
	flag.StringVar(&flagPort, "port", "", "HTTP port to listen on")
	flag.Parse()

	if flagPort != "" {
		resolvedPort = flagPort
	}

	return &Config{
		Port: resolvedPort,
	}
}
