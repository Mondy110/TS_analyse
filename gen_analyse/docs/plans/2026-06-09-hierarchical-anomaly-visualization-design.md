# 时间序列异常检测可视化重构设计文档

## 概述

重构时间序列异常检测可视化看板，实现后端二级分类数据结构与前端左文右图联动布局。

## 背景

- 现有问题：异常类型分类扁平（近 180 种堆叠），前端图表缺乏对异常点属性（`attribute` 字段）的详细文字解释
- 项目架构：FastAPI + 原生 JS + ECharts + TailwindCSS

## 数据结构参考

### `attribute` 字段结构

```python
attribute = {
    'seasonal': 'sin periodic fluctuation',  # 基础字符串
    'trend': 'keep steady',
    'frequency': 'high frequency',
    'noise': 'almost no noise',
    'anomalies': {'0_outlier': (511, 512)},
    'full_attribute_pool': {
        'seasonal': {
            'type': 'sin periodic fluctuation',
            'amplitude': 4.16,
            'detail': 'Time series shows sin periodic fluctuation...',
            'segments': [...]
        },
        'trend': {
            'type': 'keep steady',
            'start': 1.39,
            'amplitude': 6.9,
            'detail': 'From the perspective of the slope...'
        },
        'local': [
            {
                'type': 'outlier',
                'position_start': 511,
                'position_end': 512,
                'amplitude': 21.34,
                'detail': 'A single point outlier with positive amplitude 21.34'
            }
        ],
        'frequency': {
            'type': 'high frequency',
            'period': 10.7,
            'detail': 'Each fluctuation period is approximately 10.7 points...'
        },
        'noise': {
            'type': 'almost no noise',
            'std': 0.069,
            'detail': 'The overall noise standard deviation is around 0.07...'
        }
    }
}
```

## 设计方案

### 一、后端 API 重构 (`main.py`)

#### 1.1 `/api/anomaly_types` 接口变更

**现有返回：**
```json
{
  "anomaly_types": ["outlier", "spike", "increase", ...]
}
```

**新返回结构：**
```json
{
  "hierarchical_types": {
    "Point Anomalies (点异常)": ["downward outlier", "outlier", "upward outlier"],
    "Spike Anomalies (尖峰异常)": ["downward spike", "spike", "upward spike"],
    "Trend Change (趋势变化)": ["decrease", "increase", "decline", "rise"],
    "Harmonic Anomalies (谐波异常)": ["harmonic distortion", ...],
    "Wavelet Anomalies (小波异常)": ["pulse", "wavelet anomaly", ...],
    "Shape Anomalies (形态畸变)": ["convex", "inversion", "shake", ...]
  }
}
```

#### 1.2 分类映射规则

| 一级大类 | 关键词 |
|---------|--------|
| Point Anomalies (点异常) | `outlier` |
| Spike Anomalies (尖峰异常) | `spike` |
| Trend Change (趋势变化) | `increase`, `decrease`, `decline`, `rise` |
| Harmonic Anomalies (谐波异常) | `harmonic` |
| Wavelet Anomalies (小波异常) | `wavelet`, `pulse` |
| Shape Anomalies (形态畸变) | 兜底分类（不匹配以上关键词的类型） |

#### 1.3 `/api/samples` 接口修改

**新增逻辑：**
```python
# 检查是否为大类名
if anomaly_type in HIERARCHICAL_MAPPING:
    # 展开为该大类下所有子类的 OR 查询
    target_types = HIERARCHICAL_MAPPING[anomaly_type]
    if any(t in types for t in target_types):
        matched_samples.append(...)
else:
    # 原有逻辑：精确匹配子类
    if anomaly_type in types:
        matched_samples.append(...)
```

### 二、前端重构

#### 2.1 HTML 结构变更 (`index.html`)

新增一级分类下拉框，与二级分类下拉框联动：

```html
<div class="flex items-center gap-2">
    <label class="text-gray-700 font-medium">一级分类:</label>
    <select id="category-select" class="border border-gray-300 rounded px-4 py-2 min-w-[200px]">
        <option value="">全部</option>
    </select>
</div>
<div class="flex items-center gap-2">
    <label class="text-gray-700 font-medium">二级分类:</label>
    <select id="anomaly-type" class="border border-gray-300 rounded px-4 py-2 min-w-[200px]">
        <option value="">全部</option>
    </select>
</div>
```

#### 2.2 下拉框联动逻辑

1. 页面加载时，一级下拉框填充大类列表
2. 一级下拉框变化时，二级下拉框动态加载对应子类
3. 二级下拉框添加「全部」选项，允许仅按大类筛选

#### 2.3 左文右图布局

**布局结构：**
```
┌─────────────────────────────────────────────────────────────────┐
│ w-full flex flex-row gap-6 bg-white rounded-lg shadow-lg p-6   │
├──────────────────────┬──────────────────────────────────────────┤
│    左侧面板 (w-1/4)   │           右侧图表 (w-3/4)               │
│    overflow-y-auto   │                                          │
│ ┌──────────────────┐ │  ┌────────────────────────────────────┐  │
│ │ 区块A: 基础信息   │ │  │      ECharts 图表容器              │  │
│ ├──────────────────┤ │  │      height: 720px                 │  │
│ │ 区块B: 宏观特征   │ │  │      三图联动配置保持不变          │  │
│ ├──────────────────┤ │  │                                    │  │
│ │ 区块C: 局部异常   │ │  └────────────────────────────────────┘  │
│ │  (异常点卡片列表) │ │                                          │
│ └──────────────────┘ │                                          │
└──────────────────────┴──────────────────────────────────────────┘
```

#### 2.4 左侧面板内容

**区块A - 基础信息：**
- 样本序号
- 序列长度
- 异常点总数

**区块B - 宏观特征 (Normal Patterns)：**
- Seasonal: `full_attribute_pool.seasonal.type`（降级：`attribute.seasonal`）
- Trend: `full_attribute_pool.trend.type`（降级：`attribute.trend`）
- Frequency: `full_attribute_pool.frequency.type`（降级：`attribute.frequency`）
- Noise: `full_attribute_pool.noise.type`（降级：`attribute.noise`）
- Noise Std: `full_attribute_pool.noise.std`

**区块C - 局部异常详情 (Local Anomalies)：**
遍历 `full_attribute_pool.local` 数组，每个异常点生成卡片：
- Type: 异常类型
- Position: `position_start` - `position_end`
- Amplitude: 振幅（保留两位小数）
- Detail: 详细文字描述

#### 2.5 空值保护策略

```javascript
const fullAttr = sample?.attribute?.full_attribute_pool || null;
const seasonal = fullAttr?.seasonal?.type || sample?.attribute?.seasonal || 'N/A';
const trend = fullAttr?.trend?.type || sample?.attribute?.trend || 'N/A';
const frequency = fullAttr?.frequency?.type || sample?.attribute?.frequency || 'N/A';
const noiseType = fullAttr?.noise?.type || sample?.attribute?.noise || 'N/A';
const noiseStd = fullAttr?.noise?.std?.toFixed(3) || 'N/A';
const localAnomalies = fullAttr?.local || [];
```

## 文件修改清单

| 文件 | 修改内容 |
|-----|---------|
| `main.py` | 重构 `get_anomaly_types()`，修改 `get_samples()` 支持大类筛选 |
| `templates/index.html` | 新增一级分类下拉框 |
| `static/app.js` | 重构 `loadAnomalyTypes()`、`renderSingleChart()`，新增联动逻辑 |

## 技术约束

- 严格使用 TailwindCSS 原子类，不引入新的 CSS 文件
- ECharts 配置（三图联动、dataZoom）必须完整保留
- JavaScript 使用可选链 `?.` 和逻辑或 `||` 进行空值保护