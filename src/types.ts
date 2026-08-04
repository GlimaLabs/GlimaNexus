export type ServerRecord = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  os_info: string | null;
};

export type InstanceStatus = {
  state: string;
  uptime_seconds: number;
  pid: number | null;
  started_at: string | null;
};

export type LocalSystemStats = {
  cpu_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
  net_up_kbps: number;
  net_down_kbps: number;
};

export type ConfigField = {
  key: string;
  label: string;
  type: "text" | "number" | "password" | "bool";
  default: string;
};

export type ConfigSchema = {
  file: string;
  format: string;
  fields: ConfigField[];
};

export type VersionInfo = {
  installed: string | null;
  latest: string | null;
  up_to_date: boolean;
};

export type BackupEntry = {
  name: string;
  size_bytes: number;
  created_at: number;
};

export type GameTemplate = {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  requires: string[];
  start_command: string;
  default_cpu_limit_percent: number;
  default_ram_limit_mb: number;
  config?: ConfigSchema;
};

export type InstanceRecord = {
  id: string;
  server_id: string;
  game_id: string;
  display_name: string;
  install_path: string;
  systemd_unit: string;
  cpu_limit_percent: number;
  ram_limit_mb: number;
};
