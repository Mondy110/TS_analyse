# 层级化异常分类可视化重构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 重构时间序列异常检测可视化看板，实现后端二级分类数据结构与前端左文右图联动布局。

**Architecture:** 后端 FastAPI 提供层级化分类 API 并支持大类筛选（OR 展开）；前端使用两级下拉框联动，左文右图 Flexbox 布局展示详细属性信息与 ECharts 三图联动。

**Tech Stack:** FastAPI, ECharts, TailwindCSS, 原生 JavaScript

---

## Task 1: 后端 - 定义层级分类映射常量

**Files:**
- Modify: `main.py` (在第五部分辅助函数区域添加)

**Step 1: 添加层级分类映射常量**

在 `extract_anomaly_types` 函数之前添加：

```python
# 层级分类映射规则
# 定义一级大类到关键词的映射关系
CATEGORY_KEYWORDS = {
    "Point Anomalies (点异常)": ["outlier"],
    "Spike Anomalies (尖峰异常)": ["spike"],
    "Trend Change (趋势变化)": ["increase", "decrease", "decline", "rise"],
    "Harmonic Anomalies (谐波异常)": ["harmonic"],
    "Wavelet Anomalies (小波异常)": ["wavelet", "pulse"],
}

# 兜底分类名称
FALLBACK_CATEGORY = "Shape Anomalies (形态畸变)"
```

**Step 2: 验证代码语法**

运行: `python -m py_compile main.py`

预期: 无输出表示语法正确

**Step 3: 提交**

```bash
git add main.py
git commit -m "feat(backend): 添加层级分类映射常量

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: 后端 - 添加分类辅助函数

**Files:**
- Modify: `main.py` (在 CATEGORY_KEYWORDS 之后添加)

**Step 1: 添加 classify_anomaly_type 函数**

```python
def classify_anomaly_type(anomaly_type: str) -> str:
    """
    根据关键词将异常类型归类到一级大类

    Args:
        anomaly_type: 异常类型名称（如 'outlier', 'upward spike'）

    Returns:
        str: 一级大类名称
    """
    anomaly_type_lower = anomaly_type.lower()

    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in anomaly_type_lower:
                return category

    return FALLBACK_CATEGORY
```

**Step 2: 验证代码语法**

运行: `python -m py_compile main.py`

预期: 无输出表示语法正确

**Step 3: 提交**

```bash
git add main.py
git commit -m "feat(backend): 添加异常类型分类辅助函数

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: 后端 - 重构 get_anomaly_types 接口

**Files:**
- Modify: `main.py:257-276` (替换原有 get_anomaly_types 函数)

**Step 1: 重写 get_anomaly_types 函数**

将原有的 `get_anomaly_types` 函数替换为：

```python
@app.get("/api/anomaly_types")
async def get_anomaly_types():
    """
    获取层级化的异常类型列表

    返回一级大类到二级子类列表的映射字典
    用于前端两级下拉框联动
    """
    data = get_data()

    # 使用字典收集每个大类下的子类
    hierarchical_types: Dict[str, set] = {
        category: set() for category in CATEGORY_KEYWORDS.keys()
    }
    hierarchical_types[FALLBACK_CATEGORY] = set()

    for sample in data:
        anomalies = sample['attribute'].get('anomalies', {})
        types = extract_anomaly_types(anomalies)

        for anomaly_type in types:
            category = classify_anomaly_type(anomaly_type)
            hierarchical_types[category].add(anomaly_type)

    # 转换为排序后的列表，移除空分类
    result = {}
    for category in list(hierarchical_types.keys()):
        if hierarchical_types[category]:
            result[category] = sorted(list(hierarchical_types[category]))

    return {"hierarchical_types": result}
```

**Step 2: 验证代码语法**

运行: `python -m py_compile main.py`

预期: 无输出表示语法正确

**Step 3: 提交**

```bash
git add main.py
git commit -m "feat(backend): 重构 get_anomaly_types 返回层级化分类

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: 后端 - 修改 get_samples 支持大类筛选

**Files:**
- Modify: `main.py:279-322` (修改 get_samples 函数的筛选逻辑)

**Step 1: 添加构建层级映射的辅助函数**

在 `get_samples` 函数之前添加：

```python
def build_hierarchical_mapping(data: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """
    构建大类名称到子类列表的映射

    用于支持前端传入大类名称时展开为 OR 查询
    """
    mapping: Dict[str, set] = {
        category: set() for category in CATEGORY_KEYWORDS.keys()
    }
    mapping[FALLBACK_CATEGORY] = set()

    for sample in data:
        anomalies = sample['attribute'].get('anomalies', {})
        types = extract_anomaly_types(anomalies)

        for anomaly_type in types:
            category = classify_anomaly_type(anomaly_type)
            mapping[category].add(anomaly_type)

    return {k: list(v) for k, v in mapping.items() if v}
```

**Step 2: 修改 get_samples 函数的筛选逻辑**

将筛选部分替换为：

```python
@app.get("/api/samples")
async def get_samples(
    anomaly_type: str = Query(..., description="异常类型（大类或子类）"),
    limit: int = Query(10, ge=1, le=100, description="返回样本数量"),
    page: int = Query(1, ge=1, description="当前页码")
):
    """
    按异常类型筛选样本

    支持大类筛选（OR 展开）和子类精确匹配

    参数：
    - anomaly_type: 异常类型（大类名如 'Point Anomalies (点异常)' 或子类名如 'outlier'）
    - limit: 返回的样本数量，默认 10，范围 1-100
    - page: 当前页码，默认 1，最小值 1
    """
    data = get_data()

    # 构建层级映射
    hierarchical_mapping = build_hierarchical_mapping(data)

    # 确定目标类型列表
    if anomaly_type in hierarchical_mapping:
        # 大类筛选：展开为所有子类的 OR 查询
        target_types = hierarchical_mapping[anomaly_type]
    else:
        # 子类精确匹配
        target_types = [anomaly_type]

    # 筛选包含目标类型的样本
    matched_samples = []

    for sample in data:
        anomalies = sample['attribute'].get('anomalies', {})
        types = extract_anomaly_types(anomalies)

        # 检查是否包含任一目标类型
        if any(t in types for t in target_types):
            matched_samples.append(convert_sample_to_json(sample))

    # 计算分页索引
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit

    return {
        "samples": matched_samples[start_idx:end_idx],
        "total": len(matched_samples),
        "returned": min(limit, max(0, len(matched_samples) - start_idx)),
        "page": page
    }
```

**Step 3: 验证代码语法**

运行: `python -m py_compile main.py`

预期: 无输出表示语法正确

**Step 4: 提交**

```bash
git add main.py
git commit -m "feat(backend): get_samples 支持大类筛选 OR 展开

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: 前端 HTML - 新增一级分类下拉框

**Files:**
- Modify: `templates/index.html:38-49` (异常类型下拉框区域)

**Step 1: 替换控制面板中的下拉框区域**

将原有的异常类型下拉框替换为两个联动下拉框：

```html
        <div class="bg-white rounded-lg shadow-md p-4 mb-6">
            <div class="flex flex-wrap items-center gap-4">
                <!-- 一级分类下拉框 -->
                <div class="flex items-center gap-2">
                    <label for="category-select" class="text-gray-700 font-medium">
                        一级分类:
                    </label>
                    <select id="category-select"
                            class="border border-gray-300 rounded px-4 py-2 min-w-[200px]
                                   focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">全部</option>
                    </select>
                </div>

                <!-- 二级分类下拉框 -->
                <div class="flex items-center gap-2">
                    <label for="anomaly-type" class="text-gray-700 font-medium">
                        二级分类:
                    </label>
                    <select id="anomaly-type"
                            class="border border-gray-300 rounded px-4 py-2 min-w-[200px]
                                   focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">请先选择一级分类</option>
                    </select>
                </div>

                <!-- 数量选择 -->
                <div class="flex items-center gap-2">
                    <label for="limit" class="text-gray-700 font-medium">
                        数量:
                    </label>
                    <select id="limit"
                            class="border border-gray-300 rounded px-4 py-2
                                   focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="5">5</option>
                        <option value="10" selected>10</option>
                        <option value="20">20</option>
                        <option value="50">50</option>
                    </select>
                </div>

                <!-- 加载按钮 -->
                <button id="load-btn"
                        class="bg-blue-500 hover:bg-blue-600 text-white
                               px-6 py-2 rounded transition-colors duration-200
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                    加载数据
                </button>

                <!-- 状态提示 -->
                <span id="status-text" class="text-gray-500 text-sm"></span>
            </div>
        </div>
```

**Step 2: 提交**

```bash
git add templates/index.html
git commit -m "feat(frontend): 新增一级分类下拉框

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: 前端 JS - 重构全局变量和初始化

**Files:**
- Modify: `static/app.js:18-64` (全局变量和初始化部分)

**Step 1: 更新全局变量声明**

将原有的全局变量部分替换为：

```javascript
// ============================================================================
// 第一部分：全局变量和 DOM 元素引用
// ============================================================================

// 分页状态变量
let currentPage = 1;
let totalPages = 1;

// 层级分类数据缓存
let hierarchicalTypes = {};

// DOM 元素引用（页面加载完成后初始化）
let categorySelect;          // 一级分类下拉框
let anomalyTypeSelect;       // 二级分类下拉框
let limitSelect;             // 数量选择下拉框
let loadBtn;                 // 加载按钮
let statusText;              // 状态提示文本
let chartsContainer;         // 图表容器
let placeholder;             // 占位提示元素
let paginationContainer;     // 分页容器
let prevBtn;                 // 上一页按钮
let nextBtn;                 // 下一页按钮
let pageInfo;                // 页码信息显示
```

**Step 2: 更新 DOMContentLoaded 初始化**

```javascript
document.addEventListener('DOMContentLoaded', function() {
    // 获取 DOM 元素引用
    categorySelect = document.getElementById('category-select');
    anomalyTypeSelect = document.getElementById('anomaly-type');
    limitSelect = document.getElementById('limit');
    loadBtn = document.getElementById('load-btn');
    statusText = document.getElementById('status-text');
    chartsContainer = document.getElementById('charts-container');
    placeholder = document.getElementById('placeholder');
    paginationContainer = document.getElementById('pagination-container');
    prevBtn = document.getElementById('prev-btn');
    nextBtn = document.getElementById('next-btn');
    pageInfo = document.getElementById('page-info');

    // 绑定事件监听器
    categorySelect.addEventListener('change', handleCategoryChange);
    loadBtn.addEventListener('click', handleLoadData);
    prevBtn.addEventListener('click', handlePrevPage);
    nextBtn.addEventListener('click', handleNextPage);

    // 加载异常类型列表
    loadAnomalyTypes();
});
```

**Step 3: 提交**

```bash
git add static/app.js
git commit -m "feat(frontend): 更新全局变量支持两级下拉框

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: 前端 JS - 重构 loadAnomalyTypes 函数

**Files:**
- Modify: `static/app.js:76-111` (异常类型加载部分)

**Step 1: 重写 loadAnomalyTypes 函数**

```javascript
/**
 * 从后端加载层级化异常类型列表
 */
async function loadAnomalyTypes() {
    try {
        statusText.textContent = '正在加载异常类型...';

        const response = await fetch('/api/anomaly_types');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // 缓存层级数据
        hierarchicalTypes = data.hierarchical_types;

        // 清空一级下拉框并添加选项
        categorySelect.innerHTML = '<option value="">全部</option>';

        const categories = Object.keys(hierarchicalTypes);
        categories.forEach(function(category) {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });

        // 初始化二级下拉框为空
        anomalyTypeSelect.innerHTML = '<option value="">请先选择一级分类</option>';

        statusText.textContent = `已加载 ${categories.length} 个一级分类`;

    } catch (error) {
        console.error('加载异常类型失败:', error);
        statusText.textContent = '加载异常类型失败，请刷新页面重试';
        categorySelect.innerHTML = '<option value="">加载失败</option>';
    }
}
```

**Step 2: 提交**

```bash
git add static/app.js
git commit -m "feat(frontend): 重构 loadAnomalyTypes 支持层级数据

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: 前端 JS - 添加下拉框联动函数

**Files:**
- Modify: `static/app.js` (在数据加载处理部分之前添加)

**Step 1: 添加 handleCategoryChange 函数**

在 `handleLoadData` 函数之前添加：

```javascript
/**
 * 处理一级分类下拉框变化事件
 *
 * 根据选中的一级分类更新二级下拉框选项
 */
function handleCategoryChange() {
    const selectedCategory = categorySelect.value;

    // 清空二级下拉框
    anomalyTypeSelect.innerHTML = '';

    if (!selectedCategory) {
        // 未选择一级分类
        anomalyTypeSelect.innerHTML = '<option value="">请先选择一级分类</option>';
        return;
    }

    // 添加"全部"选项（用于大类筛选）
    const allOption = document.createElement('option');
    allOption.value = selectedCategory;
    allOption.textContent = '全部';
    anomalyTypeSelect.appendChild(allOption);

    // 添加该大类下的所有子类
    const subTypes = hierarchicalTypes[selectedCategory] || [];
    subTypes.forEach(function(type) {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        anomalyTypeSelect.appendChild(option);
    });
}
```

**Step 2: 提交**

```bash
git add static/app.js
git commit -m "feat(frontend): 添加两级下拉框联动逻辑

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: 前端 JS - 更新 fetchData 确保分类选择

**Files:**
- Modify: `static/app.js:158-166` (fetchData 函数的验证逻辑)

**Step 1: 修改 fetchData 中的分类验证**

将原有的分类验证部分修改为：

```javascript
async function fetchData() {
    // 获取选中的值
    const anomalyType = anomalyTypeSelect.value;

    if (!anomalyType) {
        statusText.textContent = '请选择异常类型';
        return;
    }

    // ... 后续代码保持不变
```

**Step 2: 提交**

```bash
git add static/app.js
git commit -m "fix(frontend): 更新 fetchData 分类验证逻辑

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: 前端 JS - 重构 renderSingleChart 左文右图布局

**Files:**
- Modify: `static/app.js:256-453` (renderSingleChart 函数)

**Step 1: 重写 renderSingleChart 函数**

```javascript
/**
 * 渲染单个样本的图表（左文右图布局）
 *
 * @param {Object} sample - 单个样本数据
 * @param {number} index - 样本序号
 */
function renderSingleChart(sample, index) {
    // 主容器：左文右图 Flexbox 布局
    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'w-full flex flex-row gap-6 bg-white rounded-lg shadow-lg p-6 mb-8';

    // ==================== 左侧信息面板 (w-1/4) ====================
    const leftPanel = document.createElement('div');
    leftPanel.className = 'w-1/4 flex flex-col overflow-y-auto max-h-[720px]';

    // 安全提取 full_attribute_pool
    const fullAttr = sample?.attribute?.full_attribute_pool || null;

    // 区块A: 基础信息
    const basicInfo = document.createElement('div');
    basicInfo.className = 'mb-6';
    basicInfo.innerHTML = `
        <h3 class="text-lg font-bold text-gray-800 mb-3 border-b pb-2">基础信息</h3>
        <div class="space-y-2 text-sm text-gray-700">
            <p><span class="font-medium">样本序号:</span> #${index}</p>
            <p><span class="font-medium">序列长度:</span> ${sample.time_series.length}</p>
            <p><span class="font-medium">异常点总数:</span> ${sample.labels.filter(l => l === 1).length}</p>
        </div>
    `;
    leftPanel.appendChild(basicInfo);

    // 区块B: 宏观特征 (Normal Patterns)
    const seasonal = fullAttr?.seasonal?.type || sample?.attribute?.seasonal || 'N/A';
    const trend = fullAttr?.trend?.type || sample?.attribute?.trend || 'N/A';
    const frequency = fullAttr?.frequency?.type || sample?.attribute?.frequency || 'N/A';
    const noiseType = fullAttr?.noise?.type || sample?.attribute?.noise || 'N/A';
    const noiseStd = fullAttr?.noise?.std != null ? fullAttr.noise.std.toFixed(3) : 'N/A';

    const normalPatterns = document.createElement('div');
    normalPatterns.className = 'mb-6';
    normalPatterns.innerHTML = `
        <h3 class="text-lg font-bold text-gray-800 mb-3 border-b pb-2">宏观特征 (Normal Patterns)</h3>
        <div class="space-y-2 text-sm text-gray-700">
            <p><span class="font-medium">Seasonal:</span> ${seasonal}</p>
            <p><span class="font-medium">Trend:</span> ${trend}</p>
            <p><span class="font-medium">Frequency:</span> ${frequency}</p>
            <p><span class="font-medium">Noise:</span> ${noiseType}</p>
            <p><span class="font-medium">Noise Std:</span> ${noiseStd}</p>
        </div>
    `;
    leftPanel.appendChild(normalPatterns);

    // 区块C: 局部异常详情 (Local Anomalies)
    const localAnomalies = fullAttr?.local || [];
    const localAnomaliesSection = document.createElement('div');
    localAnomaliesSection.className = 'mb-4';

    let localAnomaliesHtml = `
        <h3 class="text-lg font-bold text-gray-800 mb-3 border-b pb-2">局部异常详情 (Local Anomalies)</h3>
    `;

    if (localAnomalies.length === 0) {
        localAnomaliesHtml += `<p class="text-sm text-gray-500 italic">暂无局部异常信息</p>`;
    } else {
        localAnomalies.forEach(function(anomaly, i) {
            const amp = anomaly?.amplitude != null ? anomaly.amplitude.toFixed(2) : 'N/A';
            localAnomaliesHtml += `
                <div class="bg-red-50 border border-red-200 rounded p-3 mb-3">
                    <div class="font-medium text-red-800 mb-1">
                        异常点 #${i + 1}: ${anomaly?.type || 'Unknown'}
                    </div>
                    <div class="text-xs text-gray-600 space-y-1">
                        <p><span class="font-medium">区间:</span> ${anomaly?.position_start ?? '?'} - ${anomaly?.position_end ?? '?'}</p>
                        <p><span class="font-medium">振幅:</span> ${amp}</p>
                        <p class="text-gray-700">${anomaly?.detail || '无详细描述'}</p>
                    </div>
                </div>
            `;
        });
    }

    localAnomaliesSection.innerHTML = localAnomaliesHtml;
    leftPanel.appendChild(localAnomaliesSection);

    chartWrapper.appendChild(leftPanel);

    // ==================== 右侧图表区域 (w-3/4) ====================
    const rightPanel = document.createElement('div');
    rightPanel.className = 'w-3/4 flex flex-col';

    const chartContainer = document.createElement('div');
    chartContainer.id = `chart-${index}`;
    chartContainer.style.width = '100%';
    chartContainer.style.height = '720px';

    rightPanel.appendChild(chartContainer);
    chartWrapper.appendChild(rightPanel);

    chartsContainer.appendChild(chartWrapper);

    // ==================== ECharts 配置（保持原有三图联动逻辑） ====================
    const chartDom = document.getElementById(`chart-${index}`);
    const myChart = echarts.init(chartDom);

    const indices = Array.from({ length: sample.time_series.length }, (_, i) => i);
    const anomalyRegions = computeAnomalyRegions(sample.labels);
    const markAreaData = anomalyRegions.map(region => [
        { coord: [region.start, 'min'] },
        { coord: [region.end, 'max'] }
    ]);
    const differenceSeries = sample.time_series.map((val, i) => val - sample.normal_time_series[i]);

    const option = {
        title: [
            {
                text: 'Normal Time Series (纯净序列)',
                left: 'center',
                top: 10,
                textStyle: { fontSize: 14, color: '#3b82f6' }
            },
            {
                text: 'Time Series (含异常序列)',
                left: 'center',
                top: '34%',
                textStyle: { fontSize: 14, color: '#10b981' }
            },
            {
                text: 'Difference Series (残差序列: 异常 - 纯净)',
                left: 'center',
                top: '66%',
                textStyle: { fontSize: 14, color: '#ec4899' }
            }
        ],
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' }
        },
        legend: {
            data: ['Normal', 'Anomaly', 'Difference'],
            top: 30
        },
        grid: [
            { left: '10%', right: '5%', top: '8%', height: '22%' },
            { left: '10%', right: '5%', top: '40%', height: '22%' },
            { left: '10%', right: '5%', top: '72%', height: '22%' }
        ],
        xAxis: [
            { type: 'category', gridIndex: 0, data: indices, axisLabel: { show: false } },
            { type: 'category', gridIndex: 1, data: indices, axisLabel: { show: false } },
            { type: 'category', gridIndex: 2, data: indices, axisLabel: { show: true } }
        ],
        yAxis: [
            { type: 'value', gridIndex: 0 },
            { type: 'value', gridIndex: 1 },
            { type: 'value', gridIndex: 2 }
        ],
        series: [
            {
                name: 'Normal',
                type: 'line',
                xAxisIndex: 0,
                yAxisIndex: 0,
                data: sample.normal_time_series,
                lineStyle: { color: '#3b82f6', width: 1 },
                showSymbol: false
            },
            {
                name: 'Anomaly',
                type: 'line',
                xAxisIndex: 1,
                yAxisIndex: 1,
                data: sample.time_series,
                lineStyle: { color: '#10b981', width: 1 },
                showSymbol: false,
                markArea: {
                    data: markAreaData,
                    itemStyle: { color: 'rgba(239, 68, 68, 0.3)' }
                }
            },
            {
                name: 'Difference',
                type: 'line',
                xAxisIndex: 2,
                yAxisIndex: 2,
                data: differenceSeries,
                lineStyle: { color: '#ec4899', width: 1.2 },
                showSymbol: false,
                markArea: {
                    data: markAreaData,
                    itemStyle: { color: 'rgba(239, 68, 68, 0.3)' }
                },
                markLine: {
                    silent: true,
                    symbol: 'none',
                    label: { show: false },
                    lineStyle: { type: 'dashed', color: '#9ca3af', width: 1 },
                    data: [{ yAxis: 0 }]
                }
            }
        ],
        dataZoom: [
            {
                type: 'slider',
                xAxisIndex: [0, 1, 2],
                bottom: 15,
                height: 18
            },
            {
                type: 'inside',
                xAxisIndex: [0, 1, 2],
                zoomOnMouseWheel: true,
                moveOnMouseMove: true
            }
        ]
    };

    myChart.setOption(option);
}
```

**Step 2: 提交**

```bash
git add static/app.js
git commit -m "feat(frontend): 重构 renderSingleChart 实现左文右图布局

- 左侧面板显示基础信息、宏观特征、局部异常详情
- 右侧保留原有 ECharts 三图联动配置
- 使用 TailwindCSS 原子类样式
- 添加完善的空值保护

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: 集成测试与验证

**Files:**
- 无文件修改，仅测试

**Step 1: 启动后端服务**

```bash
cd /mnt/sda/cjmProject/TS_analyse/gen_analyse
python main.py --data-path <你的数据文件路径>
```

预期: 服务启动成功，显示 "数据加载成功"

**Step 2: 访问前端页面**

打开浏览器访问 `http://127.0.0.1:8000`

验证点：
1. 一级分类下拉框是否正确显示所有大类
2. 选择一级分类后，二级下拉框是否正确联动
3. 选择"全部"时是否能正确筛选该大类下所有样本
4. 左侧面板是否正确显示基础信息、宏观特征、局部异常详情
5. 右侧 ECharts 图表是否正常渲染（三图联动、dataZoom）

**Step 3: 最终提交（如有遗漏修复）**

```bash
git status
# 如有未提交的修改
git add -A
git commit -m "fix: 修复集成测试发现的问题

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 执行摘要

| Task | 描述 | 文件 |
|------|------|------|
| 1 | 定义层级分类映射常量 | main.py |
| 2 | 添加分类辅助函数 | main.py |
| 3 | 重构 get_anomaly_types 接口 | main.py |
| 4 | 修改 get_samples 支持大类筛选 | main.py |
| 5 | 新增一级分类下拉框 | index.html |
| 6 | 更新全局变量和初始化 | app.js |
| 7 | 重构 loadAnomalyTypes 函数 | app.js |
| 8 | 添加下拉框联动函数 | app.js |
| 9 | 更新 fetchData 分类验证 | app.js |
| 10 | 重构 renderSingleChart 左文右图布局 | app.js |
| 11 | 集成测试与验证 | - |
