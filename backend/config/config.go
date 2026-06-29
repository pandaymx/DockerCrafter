package config

import (
	"flag"
	"os"

	"gopkg.in/yaml.v3"
)

// DockerEngineConfig 保存单个 Docker 守护进程的连接配置
type DockerEngineConfig struct {
	Name      string `yaml:"name"`
	Host      string `yaml:"host"`
	TLSVerify bool   `yaml:"tls_verify"`
	CertPath  string `yaml:"cert_path"`
}

// CorsConfig 保存 CORS 相关的跨域配置
type CorsConfig struct {
	AllowOrigin  string `yaml:"allow_origin"`
	AllowMethods string `yaml:"allow_methods"`
	AllowHeaders string `yaml:"allow_headers"`
}

// Config 保存应用程序的全局配置信息
type Config struct {
	Port          string               `yaml:"port"`
	DockerEngines []DockerEngineConfig `yaml:"docker_engines"`
	CORS          CorsConfig           `yaml:"cors"`
}

// LoadConfig 级联加载配置，优先级为：
// 命令行参数 (-port) > 环境变量 (PORT) > 配置文件 (config.yaml) > 默认值 (12581)
func LoadConfig() *Config {
	// 1. 设置默认值
	resolvedPort := "12581"
	var engines []DockerEngineConfig
	var corsCfg CorsConfig

	// 2. 尝试从 YAML 配置文件中读取
	configFile := "config.yaml"
	if yamlData, err := os.ReadFile(configFile); err == nil {
		var yamlCfg Config
		if err := yaml.Unmarshal(yamlData, &yamlCfg); err == nil {
			if yamlCfg.Port != "" {
				resolvedPort = yamlCfg.Port
			}
			engines = yamlCfg.DockerEngines
			corsCfg = yamlCfg.CORS
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

	// 5. 设置默认 Docker 引擎（如果配置文件中没有定义任何 Docker 实例）
	if len(engines) == 0 {
		engines = []DockerEngineConfig{
			{
				Name: "local",
				Host: "",
			},
		}
	}

	// 6. 设置默认 CORS 配置（若未配置，默认全开以便开发调试）
	if corsCfg.AllowOrigin == "" {
		corsCfg.AllowOrigin = "*"
	}
	if corsCfg.AllowMethods == "" {
		corsCfg.AllowMethods = "GET, OPTIONS"
	}
	if corsCfg.AllowHeaders == "" {
		corsCfg.AllowHeaders = "Content-Type"
	}

	return &Config{
		Port:          resolvedPort,
		DockerEngines: engines,
		CORS:          corsCfg,
	}
}
