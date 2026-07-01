package models

// Workspace 表示工作区/分组表
type Workspace struct {
	ID          uint   `gorm:"primaryKey"`
	Name        string `gorm:"size:255;not null"`
	Description string `gorm:"type:text"`
}

// ContainerMeta 表示容器备注与关联表
type ContainerMeta struct {
	ContainerID string    `gorm:"primaryKey;size:255"`
	WorkspaceID uint      `gorm:"index"`
	Workspace   Workspace `gorm:"foreignKey:WorkspaceID"`
	Remark      string    `gorm:"size:255"`
}
