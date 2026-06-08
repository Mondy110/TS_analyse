# 异常检测分析看板

一个基于 FastAPI + ECharts 的异常检测结果可视化分析工具。

## 功能特性

- **数据集管理**：自动扫描并解析指定目录下的 pkl 文件
- **交互式可视化**：
  - 时序与异常分数对齐图（上下分栏联动布局）
  - 区分度分析直方图（双 Y 轴）
  - 关联性散点图
- **键盘导航**：支持方向键控制图表缩放和样本切换
- **响应式设计**：适配不同屏幕尺寸

## 技术栈

- **后端**：FastAPI + Uvicorn
- **前端**：TailwindCSS + ECharts 5.4.3

## 安装依赖

```bash
pip install fastapi uvicorn
```

## 使用方法

### 1. 准备数据

将异常检测结果文件放置到数据目录，文件命名格式：

```
{序号}_{数据集名}_id_{样本号}_{类别}_tr_{长度}_1st_{编号}_results.pkl
```

pkl 文件应包含以下字段：
- `value`: 时间序列数据
- `label`: 标签（0=正常，1=异常，-1=Padding）
- `anomaly_score`: 异常分数

### 2. 启动服务

```bash
# 默认数据目录 ./output/VETime，端口 8000
python app.py

# 指定数据目录和端口
python app.py --data-dir /path/to/data --port 8080
```

### 3. 访问看板

打开浏览器访问 `http://localhost:8000`

## 键盘快捷键

| 按键 | 功能 |
|------|------|
| ← → | 平移时序图窗口 |
| ↑ ↓ | 切换样本（焦点不在下拉框时） |

## 项目结构

```
result_analyse/
├── app.py              # FastAPI 后端服务
├── static/
│   ├── index.html      # 前端页面
│   ├── style.css       # 样式文件
│   └── app.js          # 前端逻辑
└── README.md
```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 前端页面 |
| `/api/datasets` | GET | 获取数据集列表 |
| `/api/data/{dataset}/{sample_id}` | GET | 获取样本数据 |
