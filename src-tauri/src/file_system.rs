use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

// ============== 配置管理结构 ==============

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    // AI 配置
    #[serde(rename = "aiDelay")]
    pub ai_delay: u32,          // AI 触发延迟 (ms)
    #[serde(rename = "apiBaseUrl")]
    pub api_base_url: String,   // API 基础 URL
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>, // API 密钥
    #[serde(rename = "isAIEnabled")]
    pub is_ai_enabled: bool,    // 是否启用 AI

    // 编辑器配置
    pub theme: String,          // 主题 (dark/light)
    pub language: String,       // 语言 (zh-CN/en-US)
    #[serde(rename = "fontSize")]
    pub font_size: u32,         // 字体大小
    #[serde(rename = "lineHeight")]
    pub line_height: f32,       // 行高
    #[serde(rename = "autoSaveInterval")]
    pub auto_save_interval: u32,// 自动保存间隔 (ms)

    // 工作区配置
    #[serde(rename = "workspaceRoot")]
    pub workspace_root: Option<String>, // 工作区根目录

    // UI 配置
    #[serde(rename = "sidebarCollapsed")]
    pub sidebar_collapsed: bool,   // 左侧边栏是否收起
    #[serde(rename = "rightPanelCollapsed")]
    pub right_panel_collapsed: bool, // 右侧面板是否收起
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            ai_delay: 2000,
            api_base_url: "https://open.bigmodel.cn/api/paas/v4/chat/completions".to_string(),
            api_key: None,
            is_ai_enabled: true,
            theme: "dark".to_string(),
            language: "zh-CN".to_string(),
            font_size: 16,
            line_height: 1.8,
            auto_save_interval: 30000,
            workspace_root: None,
            sidebar_collapsed: false,
            right_panel_collapsed: false,
        }
    }
}

// 小说信息（简化版，用于列表显示）
#[derive(Debug, Serialize, Deserialize)]
pub struct NovelInfo {
    pub name: String,
    pub path: String,
    pub chapter_count: usize,
    pub total_word_count: usize,
    pub has_outline: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    path: String,
    exists: bool,
    is_directory: bool,
    size: Option<u64>,
}

// 章节信息结构
#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterInfo {
    pub filename: String,
    pub title: String,
    pub chapter_number: u32,
    pub word_count: usize,
    pub path: String,
    pub has_summary: bool, // 是否有 AI 总结
    pub modified_time: Option<String>, // ISO 8601 格式
}

// 小说工程信息结构
#[derive(Debug, Serialize, Deserialize)]
pub struct NovelProjectInfo {
    pub name: String,
    pub path: String,
    pub chapters: Vec<ChapterInfo>,
    pub has_outline: bool,
    pub has_inkflow_folder: bool,
    pub total_word_count: usize,
}

// 章节总结结构
#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterSummary {
    pub chapter_path: String,
    pub summary: String,
    pub keywords: Vec<String>,
    pub generated_at: String, // ISO 8601 格式
}

// 大纲结构
#[derive(Debug, Serialize, Deserialize)]
pub struct NovelOutline {
    pub title: String,
    pub summary: String,
    pub characters: Vec<Character>,
    pub plot_points: Vec<String>,
    pub world_setting: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Character {
    pub name: String,
    pub description: String,
    pub role: String, // 主角、配角、反派等
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    match fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&path).parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return Err(format!("Failed to create directory: {}", e));
        }
    }

    match fs::write(&path, content) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write file: {}", e)),
    }
}

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    match fs::create_dir_all(&path) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to create directory: {}", e)),
    }
}

#[tauri::command]
pub async fn directory_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists() && Path::new(&path).is_dir())
}

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists() && Path::new(&path).is_file())
}

/// 打开文件夹选择对话框
#[tauri::command]
pub async fn open_folder_dialog() -> Result<String, String> {
    // 注意：Tauri 1.x 的对话框功能有限
    // 这里返回一个默认路径，实际应用中需要使用 rfd 库
    // 或者让前端使用 Tauri API 的 dialog 插件

    // 为了演示，返回一个常见路径
    // 在实际应用中，用户应该通过前端调用 dialog API 选择
    Ok(String::new())
}

// ============== Sprint 3: 小说工程管理功能 ==============

/// 扫描小说目录，获取所有章节信息
#[tauri::command]
pub async fn list_chapters(path: String) -> Result<NovelProjectInfo, String> {
    let project_path = Path::new(&path);

    // 检查目录是否存在
    if !project_path.exists() || !project_path.is_dir() {
        return Err("指定路径不是有效的目录".to_string());
    }

    let novel_name = project_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("未命名小说")
        .to_string();

    // 检查 .inkflow 文件夹
    let inkflow_folder = project_path.join(".inkflow");
    let has_inkflow_folder = inkflow_folder.exists();

    // 检查 outline.md
    let outline_path = project_path.join("outline.md");
    let has_outline = outline_path.exists();

    // 读取目录中的所有文件
    let mut chapters = Vec::new();
    let mut total_word_count = 0;

    let entries = fs::read_dir(project_path)
        .map_err(|e| format!("无法读取目录: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取文件项失败: {}", e))?;
        let file_path = entry.path();

        // 只处理 .md 和 .txt 文件
        let extension = file_path.extension().and_then(|e| e.to_str());
        if extension != Some("md") && extension != Some("txt") {
            continue;
        }

        // 跳过 outline.md 和隐藏文件
        let filename = file_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if filename == "outline.md" || filename.starts_with('.') {
            continue;
        }

        // 解析章节信息
        let chapter_info = parse_chapter_info(&file_path, &inkflow_folder).await?;
        total_word_count += chapter_info.word_count;
        chapters.push(chapter_info);
    }

    // 按章节号排序
    chapters.sort_by(|a, b| a.chapter_number.cmp(&b.chapter_number));

    Ok(NovelProjectInfo {
        name: novel_name,
        path: path.clone(),
        chapters,
        has_outline,
        has_inkflow_folder,
        total_word_count,
    })
}

/// 解析单个章节文件的信息
async fn parse_chapter_info(
    file_path: &Path,
    inkflow_folder: &Path,
) -> Result<ChapterInfo, String> {
    let filename = file_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let file_stem = file_path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    // 提取章节号和标题
    // 支持格式：001_第一章.md 或 第一章.md
    let (chapter_number, title) = if let Some(pos) = file_stem.find('_') {
        // 格式：001_第一章
        let num_str = &file_stem[..pos];
        let title_text = &file_stem[pos + 1..];
        let num = num_str.parse::<u32>().unwrap_or(0);
        (num, title_text.to_string())
    } else {
        // 尝试从开头提取数字
        let num = file_stem.chars()
            .take_while(|c| c.is_numeric())
            .collect::<String>()
            .parse::<u32>()
            .unwrap_or(0);

        let title = if num > 0 {
            file_stem.chars()
                .skip_while(|c| c.is_numeric() || *c == '_')
                .collect::<String>()
        } else {
            file_stem.to_string()
        };

        (num, title)
    };

    // 读取文件内容计算字数
    let content = fs::read_to_string(file_path)
        .unwrap_or_default();
    let word_count = content.chars().count();

    // 获取文件修改时间
    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("无法获取文件元数据: {}", e))?;

    let modified_time = metadata.modified()
        .ok()
        .and_then(|t| {
            let datetime = chrono::DateTime::<chrono::Utc>::from(t);
            Some(format!("{}", datetime.format("%Y-%m-%dT%H:%M:%SZ")))
        });

    // 检查是否有对应的总结文件
    let json_path = inkflow_folder.join(format!("{}.json", file_stem));
    let has_summary = json_path.exists();

    Ok(ChapterInfo {
        filename,
        title,
        chapter_number,
        word_count,
        path: file_path.to_str().unwrap_or("").to_string(),
        has_summary,
        modified_time,
    })
}

/// 读取小说大纲
#[tauri::command]
pub async fn get_novel_outline(path: String) -> Result<NovelOutline, String> {
    let outline_path = Path::new(&path).join("outline.md");

    if !outline_path.exists() {
        // 返回空大纲
        return Ok(NovelOutline {
            title: String::new(),
            summary: String::new(),
            characters: Vec::new(),
            plot_points: Vec::new(),
            world_setting: None,
        });
    }

    let content = fs::read_to_string(&outline_path)
        .map_err(|e| format!("无法读取大纲文件: {}", e))?;

    // 简单解析 markdown 格式的大纲
    // 实际应用中可以使用更复杂的 markdown 解析器
    let mut title = String::new();
    let mut summary = String::new();
    let mut characters = Vec::new();
    let mut plot_points = Vec::new();
    let mut world_setting = None;

    let mut current_section = String::new();
    let mut current_content: Vec<String> = Vec::new();

    for line in content.lines() {
        if line.starts_with("# ") {
            // 保存上一个section
            if !current_section.is_empty() {
                match current_section.as_str() {
                    "标题" => title = current_content.join("\n"),
                    "简介" => summary = current_content.join("\n"),
                    "人物" => {
                        for char_line in &current_content {
                            if let Some(pos) = char_line.find('-') {
                                let char_name = char_line[..pos].trim().to_string();
                                let char_desc = char_line[pos + 1..].trim().to_string();
                                characters.push(Character {
                                    name: char_name,
                                    description: char_desc,
                                    role: "未定义".to_string(),
                                });
                            }
                        }
                    }
                    "情节" => plot_points = current_content.clone(),
                    "世界观" => world_setting = Some(current_content.join("\n")),
                    _ => {}
                }
            }

            current_section = line[2..].to_string();
            current_content.clear();
        } else {
            current_content.push(line.to_string());
        }
    }

    // 处理最后一个 section
    if !current_section.is_empty() {
        match current_section.as_str() {
            "标题" => title = current_content.join("\n"),
            "简介" => summary = current_content.join("\n"),
            "人物" => {
                for char_line in &current_content {
                    if let Some(pos) = char_line.find('-') {
                        let char_name = char_line[..pos].trim().to_string();
                        let char_desc = char_line[pos + 1..].trim().to_string();
                        characters.push(Character {
                            name: char_name,
                            description: char_desc,
                            role: "未定义".to_string(),
                        });
                    }
                }
            }
            "情节" => plot_points = current_content.clone(),
            "世界观" => world_setting = Some(current_content.join("\n")),
            _ => {}
        }
    }

    Ok(NovelOutline {
        title,
        summary,
        characters,
        plot_points,
        world_setting,
    })
}

/// 保存章节总结
#[tauri::command]
pub async fn save_chapter_summary(
    novel_path: String,
    chapter_filename: String,
    summary: ChapterSummary,
) -> Result<(), String> {
    // 创建 .inkflow 文件夹
    let inkflow_folder = Path::new(&novel_path).join(".inkflow");
    if !inkflow_folder.exists() {
        fs::create_dir_all(&inkflow_folder)
            .map_err(|e| format!("无法创建 .inkflow 文件夹: {}", e))?;
    }

    // 生成 JSON 文件名
    let file_stem = Path::new(&chapter_filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");

    let json_path = inkflow_folder.join(format!("{}.json", file_stem));

    // 序列化并保存
    let json_content = serde_json::to_string_pretty(&summary)
        .map_err(|e| format!("序列化总结失败: {}", e))?;

    fs::write(&json_path, json_content)
        .map_err(|e| format!("写入总结文件失败: {}", e))?;

    println!("✅ 章节总结已保存: {:?}", json_path);

    Ok(())
}

/// 创建新小说工程
#[tauri::command]
pub async fn create_new_novel(
    base_path: String,
    name: String,
) -> Result<String, String> {
    // 验证小说名称
    if name.is_empty() {
        return Err("小说名称不能为空".to_string());
    }

    // 创建小说目录
    let novel_path = Path::new(&base_path).join(&name);

    if novel_path.exists() {
        return Err("目录已存在".to_string());
    }

    fs::create_dir_all(&novel_path)
        .map_err(|e| format!("创建目录失败: {}", e))?;

    // 创建 .inkflow 文件夹
    let inkflow_path = novel_path.join(".inkflow");
    fs::create_dir_all(&inkflow_path)
        .map_err(|e| format!("创建 .inkflow 文件夹: {}", e))?;

    // 创建默认大纲文件
    let outline_path = novel_path.join("outline.md");
    let default_outline = format!("# 标题\n{}\n\n# 简介\n\n\n# 人物\n\n\n# 情节\n\n\n# 世界观\n\n", name);
    fs::write(&outline_path, default_outline)
        .map_err(|e| format!("创建大纲文件失败: {}", e))?;

    // 创建第一章
    let first_chapter_path = novel_path.join("001_第一章.md");
    let first_chapter_content = "# 第一章\n\n";
    fs::write(&first_chapter_path, first_chapter_content)
        .map_err(|e| format!("创建第一章失败: {}", e))?;

    println!("✅ 新小说工程创建成功: {:?}", novel_path);

    Ok(novel_path.to_str().unwrap_or("").to_string())
}

/// 创建新章节
#[tauri::command]
pub async fn create_new_chapter(
    novel_path: String,
    title: String,
) -> Result<ChapterInfo, String> {
    let novel_dir = Path::new(&novel_path);

    if !novel_dir.exists() {
        return Err("小说目录不存在".to_string());
    }

    // 扫描现有章节，找到最大编号
    let entries = fs::read_dir(novel_dir)
        .map_err(|e| format!("读取目录失败: {}", e))?;

    let mut max_chapter_num = 0u32;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取文件项失败: {}", e))?;
        let file_path = entry.path();

        // 只处理 .md 和 .txt 文件
        let extension = file_path.extension().and_then(|e| e.to_str());
        if extension != Some("md") && extension != Some("txt") {
            continue;
        }

        let filename = file_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        // 跳过 outline.md 和隐藏文件
        if filename == "outline.md" || filename.starts_with('.') {
            continue;
        }

        // 提取章节号
        let file_stem = file_path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");

        if let Some(pos) = file_stem.find('_') {
            let num_str = &file_stem[..pos];
            if let Ok(num) = num_str.parse::<u32>() {
                if num > max_chapter_num {
                    max_chapter_num = num;
                }
            }
        }
    }

    // 新章节号递增
    let new_chapter_num = max_chapter_num + 1;

    // 生成文件名：001_第X章.md
    let filename = format!("{:03}_{}.md", new_chapter_num, title);
    let file_path = novel_dir.join(&filename);

    // 创建文件
    let content = format!("# {}\n\n", title);
    fs::write(&file_path, content)
        .map_err(|e| format!("创建章节文件失败: {}", e))?;

    println!("✅ 新章节创建成功: {:?}", file_path);

    Ok(ChapterInfo {
        filename: filename.clone(),
        title,
        chapter_number: new_chapter_num,
        word_count: 0,
        path: file_path.to_str().unwrap_or("").to_string(),
        has_summary: false,
        modified_time: None,
    })
}

// ============== 配置管理功能 ==============

/// 获取配置文件路径
fn get_config_path() -> Result<PathBuf, String> {
    // 获取用户文档目录
    let docs_dir = dirs::document_dir()
        .ok_or("无法获取用户文档目录".to_string())?;

    let config_dir = docs_dir.join("InkFlow");
    let config_path = config_dir.join("inkflow_settings.json");

    // 确保配置目录存在
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("无法创建配置目录: {}", e))?;
    }

    Ok(config_path)
}

/// 加载应用配置
#[tauri::command]
pub async fn load_config() -> Result<AppConfig, String> {
    let config_path = get_config_path()?;

    if !config_path.exists() {
        // 配置文件不存在，返回默认配置
        println!("📝 配置文件不存在，使用默认配置");
        return Ok(AppConfig::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("无法读取配置文件: {}", e))?;

    let config: AppConfig = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置文件失败: {}", e))?;

    println!("✅ 配置已加载: {:?}", config_path);
    Ok(config)
}

/// 保存应用配置
#[tauri::command]
pub async fn save_config(config: AppConfig) -> Result<(), String> {
    let config_path = get_config_path()?;

    let json_content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;

    fs::write(&config_path, json_content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;

    println!("✅ 配置已保存: {:?}", config_path);
    Ok(())
}

// ============== 小说列表扫描功能 ==============

/// 扫描指定根目录下的所有小说工程
#[tauri::command]
pub async fn list_novels(root_path: String) -> Result<Vec<NovelInfo>, String> {
    let root = Path::new(&root_path);

    if !root.exists() || !root.is_dir() {
        return Err("指定的根路径不存在或不是目录".to_string());
    }

    let mut novels = Vec::new();

    let entries = fs::read_dir(root)
        .map_err(|e| format!("无法读取根目录: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();

        // 只处理子目录
        if !path.is_dir() {
            continue;
        }

        // 跳过隐藏目录
        let dir_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        if dir_name.starts_with('.') {
            continue;
        }

        // 检查是否是有效的小说工程（包含 outline.md 或章节文件）
        let outline_path = path.join("outline.md");
        let has_outline = outline_path.exists();

        // 扫描章节文件
        let mut chapter_count = 0;
        let mut total_word_count = 0;

        let chapter_entries = fs::read_dir(&path);
        if let Ok(entries) = chapter_entries {
            for entry in entries.flatten() {
                let file_path = entry.path();

                // 只处理 .md 和 .txt 文件
                let extension = file_path.extension().and_then(|e| e.to_str());
                if extension != Some("md") && extension != Some("txt") {
                    continue;
                }

                let filename = file_path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("");

                // 跳过 outline.md 和隐藏文件
                if filename == "outline.md" || filename.starts_with('.') {
                    continue;
                }

                // 计算字数
                if let Ok(content) = fs::read_to_string(&file_path) {
                    total_word_count += content.chars().count();
                }

                chapter_count += 1;
            }
        }

        // 至少包含一个章节或大纲才算有效小说
        if chapter_count > 0 || has_outline {
            novels.push(NovelInfo {
                name: dir_name.to_string(),
                path: path.to_str().unwrap_or("").to_string(),
                chapter_count,
                total_word_count,
                has_outline,
            });
        }
    }

    // 按名称排序
    novels.sort_by(|a, b| a.name.cmp(&b.name));

    println!("✅ 扫描完成：找到 {} 个小说工程", novels.len());
    Ok(novels)
}