package models

// ContainerInfo 包装单个容器的开发关注属性
type ContainerInfo struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Image       string            `json:"image"`
	State       string            `json:"state"`       // running, exited
	Status      string            `json:"status"`      // up 2 hours, health: healthy
	Ports       []string          `json:"ports"`       // 格式化后的端口，如 ["8089:8089"]
	Labels      map[string]string `json:"labels"`
	CpuUsage    float64           `json:"cpuUsage"`    // 实时百分比
	MemoryUsage int64             `json:"memoryUsage"` // 字节数
}

// ProjectWorkspace 项目/业务维度的看板容器
type ProjectWorkspace struct {
	ProjectName string          `json:"projectName"` // 来自 com.docker.compose.project 或自定义
	IsCompose   bool            `json:"isCompose"`
	Containers  []ContainerInfo `json:"containers"`
}
