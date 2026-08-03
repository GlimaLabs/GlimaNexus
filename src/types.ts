export type ServerRecord = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
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
