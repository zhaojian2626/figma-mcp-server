# GitHub 推送指南

## 步骤 1: 初始化 Git 仓库

```bash
cd /Users/altasv/AndroidStudioProjects/figma-mcp-server
git init
```

## 步骤 2: 检查 .gitignore

确保 `.gitignore` 包含以下内容（已自动创建）：
- `node_modules/`
- `config.json` (包含敏感信息)
- `output/` (下载的文件)
- `.env` (环境变量)
- 其他临时文件

## 步骤 3: 添加文件并提交

```bash
# 添加所有文件（.gitignore 会自动排除敏感文件）
git add .

# 提交
git commit -m "Initial commit: Figma MCP Server"
```

## 步骤 4: 在 GitHub 创建仓库

1. 访问 https://github.com/new
2. 输入仓库名称（例如：`figma-mcp-server`）
3. 选择 Public 或 Private
4. **不要**初始化 README、.gitignore 或 license（我们已经有了）
5. 点击 "Create repository"

## 步骤 5: 连接并推送

```bash
# 添加远程仓库（替换 YOUR_USERNAME 和 REPO_NAME）
git remote add origin https://github.com/YOUR_USERNAME/figma-mcp-server.git

# 或者使用 SSH（如果已配置）
# git remote add origin git@github.com:YOUR_USERNAME/figma-mcp-server.git

# 推送代码
git branch -M main
git push -u origin main
```

## 重要提示

### ⚠️ 安全注意事项

1. **config.json 不会被提交**（已在 .gitignore 中）
2. **确保没有敏感信息在代码中**：
   - 检查所有文件是否包含 accessToken 或 fileKey
   - 使用 `config.json.example` 作为模板

3. **如果已经提交了敏感信息**：
   ```bash
   # 从 Git 历史中删除敏感文件
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch config.json" \
     --prune-empty --tag-name-filter cat -- --all
   
   # 强制推送（谨慎使用）
   git push origin --force --all
   ```

## 推送后的操作

### 添加 GitHub Actions（可选）

创建 `.github/workflows/test.yml` 用于 CI/CD。

### 添加 License

如果需要，添加 LICENSE 文件。

### 更新 README

确保 README.md 包含：
- 项目描述
- 安装说明
- 使用说明
- 贡献指南

