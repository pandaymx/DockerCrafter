package logger

import (
	"log"
	"strings"
)

// Level 定义日志级别类型
type Level int

const (
	DEBUG Level = iota
	INFO
	WARN
	ERROR
)

var currentLevel Level = INFO

// SetLevel 根据字符串解析并设置当前的全局日志级别
func SetLevel(levelStr string) {
	switch strings.ToUpper(strings.TrimSpace(levelStr)) {
	case "DEBUG":
		currentLevel = DEBUG
	case "INFO":
		currentLevel = INFO
	case "WARN", "WARNING":
		currentLevel = WARN
	case "ERROR":
		currentLevel = ERROR
	default:
		currentLevel = INFO
	}
}

// GetLevelString 获取当前日志级别的字符串表示
func GetLevelString() string {
	switch currentLevel {
	case DEBUG:
		return "DEBUG"
	case INFO:
		return "INFO"
	case WARN:
		return "WARN"
	case ERROR:
		return "ERROR"
	default:
		return "INFO"
	}
}

// Debugf 输出 DEBUG 级别的日志
func Debugf(format string, v ...interface{}) {
	if currentLevel <= DEBUG {
		log.Printf("[DEBUG] "+format, v...)
	}
}

// Infof 输出 INFO 级别的日志
func Infof(format string, v ...interface{}) {
	if currentLevel <= INFO {
		log.Printf("[INFO] "+format, v...)
	}
}

// Warnf 输出 WARN 级别的日志
func Warnf(format string, v ...interface{}) {
	if currentLevel <= WARN {
		log.Printf("[WARN] "+format, v...)
	}
}

// Errorf 输出 ERROR 级别的日志
func Errorf(format string, v ...interface{}) {
	if currentLevel <= ERROR {
		log.Printf("[ERROR] "+format, v...)
	}
}

// Fatalf 输出 FATAL 级别的日志并终止程序
func Fatalf(format string, v ...interface{}) {
	log.Fatalf("[FATAL] "+format, v...)
}
