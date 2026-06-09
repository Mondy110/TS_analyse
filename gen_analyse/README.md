# 时间序列异常检测可视化

基于 FastAPI + ECharts 的时间序列异常检测数据可视化工具。

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务
python main.py --data-path /mnt/sda/cjmProject/VETime/dataset/vetime_train_all_150000.pkl --port 8000
```

访问 http://127.0.0.1:8000 开始使用。

## 功能特点

- 支持 40 种异常类型筛选
- 双图联动对比（纯净序列 vs 含异常序列）
- 异常区间高亮显示
- 图表缩放功能

## 数据来源

数据集路径：`../dataset/vetime_train_all_150000.pkl`

## API 接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/` | GET | 前端页面 |
| `/api/status` | GET | 数据加载状态 |
| `/api/anomaly_types` | GET | 异常类型列表 |
| `/api/samples` | GET | 按类型筛选样本 |
