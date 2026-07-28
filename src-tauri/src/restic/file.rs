


#[derive(serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
#[serde(default)]
pub struct File {
    #[serde(default)]
    pub name: String,
    #[serde(rename = "type", default)]
    pub type_: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub uid: i64,
    #[serde(default)]
    pub gid: i64,
    #[serde(default)]
    pub size: i64,
    #[serde(default)]
    pub mode: i64,
    #[serde(default)]
    pub mtime: String,
    #[serde(default)]
    pub atime: String,
    #[serde(default)]
    pub ctime: String,
}
