# AutoNovel-Studio 测试套件

本目录包含所有测试脚本，用于验证系统的各个组件。

## 📋 测试文件列表

### 核心组件测试

| 测试文件 | 功能 | 依赖 |
|---------|------|------|
| `test_author.py` | 测试作者代理（内容生成） | 无 |
| `test_readers.py` | 测试4个读者代理（并发审查） | test_author.py |
| `test_editor.py` | 测试编辑代理（仲裁决策） | test_author.py |
| `test_ai_tone.py` | 测试AI味扫雷器（独立） | test_author.py |

### 系统测试

| 测试文件 | 功能 |
|---------|------|
| `test_system.py` | 完整系统验证（所有组件集成） |
| `test_api.py` | API连接测试 |

### 调试工具

| 测试文件 | 功能 |
|---------|------|
| `test_json.py` | JSON解析调试工具 |

---

## 🚀 快速开始

### 1. 准备环境

确保已在项目根目录创建 `.env` 文件：

```bash
cd ..
# 从 .env.example 复制或手动创建
```

### 2. 运行测试

从项目根目录运行测试：

```bash
# 测试作者代理
python tests/test_author.py

# 测试读者矩阵（4个读者）
python tests/test_readers.py

# 测试编辑代理
python tests/test_editor.py

# 测试AI味扫雷器
python tests/test_ai_tone.py

# 完整系统测试
python tests/test_system.py
```

### 3. 查看测试结果

- ✅ **测试通过** - 组件工作正常
- ⚠️ **评分警告** - 质量问题需修复
- ❌ **测试失败** - 检查错误日志

---

## 📊 测试流程建议

### 标准测试流程

1. **API测试** → 验证连接
   ```bash
   python tests/test_api.py
   ```

2. **作者代理测试** → 生成测试草稿
   ```bash
   python tests/test_author.py
   ```

3. **读者矩阵测试** → 验证4读者审查
   ```bash
   python tests/test_readers.py
   ```

4. **AI味扫雷测试** → 验证AI腔检测
   ```bash
   python tests/test_ai_tone.py
   ```

5. **编辑代理测试** → 验证仲裁逻辑
   ```bash
   python tests/test_editor.py
   ```

6. **完整系统测试** → 验证工作流
   ```bash
   python tests/test_system.py
   ```

---

## 🔧 故障排查

### 常见问题

**Q: 测试失败，提示找不到模块**
```bash
A: 确保从项目根目录运行，不要进入 tests/ 目录运行
   正确: python tests/test_author.py
   错误: cd tests && python test_author.py
```

**Q: API连接失败**
```bash
A: 检查 .env 文件配置：
   - OPENAI_API_KEY 是否正确
   - OPENAI_BASE_URL 是否可访问
   运行: python tests/test_api.py 验证
```

**Q: 测试草稿不存在**
```bash
A: 某些测试依赖其他测试的输出：
   - test_readers.py 需要 test_author.py 生成的草稿
   - test_editor.py 需要 test_author.py 生成的草稿
   按顺序运行：test_author.py → test_readers.py → test_editor.py
```

---

## 📝 测试数据位置

测试生成的数据保存在以下位置：

- **草稿**: `04_Drafts/test_scene.txt`
- **配置**: `00_Config/`, `01_Global_Settings/`, `02_Outlines/`

---

## 🎯 测试覆盖范围

### 已测试功能

- ✅ Author Agent (内容生成)
- ✅ Lore Keeper Agent (考据党)
- ✅ Pacing Junkie Agent (节奏党)
- ✅ Anti-Trope Scanner Agent (反套路)
- ✅ AI Tone Scanner Agent (AI味扫雷)
- ✅ Editor Agent (编辑仲裁)
- ✅ Reader Matrix (并发审查)
- ✅ JSON解析 (多策略fallback)
- ✅ State Machine (状态机)

---

## 🛠️ 开发说明

### 添加新测试

1. 在 `tests/` 目录创建 `test_xxx.py`
2. 设置正确的路径：
   ```python
   sys.path.insert(0, str(Path(__file__).parent.parent))
   ```
3. 遵循现有测试的命名和结构
4. 更新本README

### 测试命名规范

- `test_<组件名>.py` - 单组件测试
- `test_system.py` - 完整系统测试
- `test_<功能>.py` - 功能性测试

---

## 📚 相关文档

- 项目根目录: `CLAUDE.md`
- 系统文档: `系统开发文档.md`
- 配置说明: `00_Config/README.md`
