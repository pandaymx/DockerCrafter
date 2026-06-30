export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string[] | null;
  labels: Record<string, string>;
  cpuUsage: number;
  memoryUsage: number;
  memoryLimit: number;
}

export interface ProjectWorkspace {
  projectName: string;
  isCompose: boolean;
  containers: ContainerInfo[];
  engineName: string;
}
