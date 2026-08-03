use serde::{Deserialize, Serialize};

const GAMES_JSON: &str = include_str!("../resources/games.json");

#[derive(Serialize, Deserialize, Clone)]
pub struct GameInstall {
    #[serde(rename = "type")]
    pub install_type: String,
    pub steps: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GameTemplate {
    pub id: String,
    pub name: String,
    pub subtitle: String,
    pub icon: String,
    pub requires: Vec<String>,
    pub install: GameInstall,
    pub start_command: String,
    pub default_cpu_limit_percent: u32,
    pub default_ram_limit_mb: u32,
}

#[derive(Deserialize)]
struct GamesFile {
    games: Vec<GameTemplate>,
}

pub fn load_templates() -> Vec<GameTemplate> {
    let file: GamesFile = serde_json::from_str(GAMES_JSON).expect("bundled games.json must be valid");
    file.games
}

pub fn find_template(game_id: &str) -> Option<GameTemplate> {
    load_templates().into_iter().find(|g| g.id == game_id)
}

/// Substitutes `{instance_id}` / `{ram_limit_mb}` placeholders in install steps and start command.
pub fn render_step(template: &str, instance_id: &str, ram_limit_mb: u32) -> String {
    template
        .replace("{instance_id}", instance_id)
        .replace("{ram_limit_mb}", &ram_limit_mb.to_string())
}
