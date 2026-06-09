/**
 * 时间序列异常检测可视化 - 前端逻辑
 *
 * 本模块负责：
 * 1. 页面初始化和异常类型加载
 * 2. 样本数据获取和处理
 * 3. ECharts 图表渲染
 * 4. 异常区间高亮显示
 *
 * 作者：VETime 项目组
 * 日期：2026-06-08
 */

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

// ============================================================================
// 第二部分：页面初始化
// ============================================================================

/**
 * 页面加载完成后执行初始化
 *
 * DOMContentLoaded 事件在 HTML 解析完成后触发
 * 此时所有 DOM 元素都已可用
 */
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

// ============================================================================
// 第三部分：异常类型加载
// ============================================================================

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

// ============================================================================
// 第四部分：数据加载处理
// ============================================================================

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

/**
 * 处理"加载数据"按钮点击事件
 *
 * 1. 重置页码为第一页
 * 2. 获取选中的异常类型和数量
 * 3. 发送请求到后端
 * 4. 渲染图表
 */
async function handleLoadData() {
    // 重置页码
    currentPage = 1;
    await fetchData();
}

/**
 * 处理上一页按钮点击事件
 */
async function handlePrevPage() {
    if (currentPage > 1) {
        currentPage--;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        await fetchData();
    }
}

/**
 * 处理下一页按钮点击事件
 */
async function handleNextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        await fetchData();
    }
}

/**
 * 核心数据请求函数
 *
 * 发送请求到后端并渲染图表
 */
async function fetchData() {
    // 获取选中的值
    const anomalyType = anomalyTypeSelect.value;
    const limit = parseInt(limitSelect.value);

    if (!anomalyType) {
        statusText.textContent = '请选择异常类型';
        return;
    }

    try {
        // 禁用按钮，显示加载状态
        loadBtn.disabled = true;
        loadBtn.textContent = '加载中...';
        statusText.textContent = '正在加载数据，首次加载可能需要较长时间...';

        // 发送请求
        // URL 参数使用 URLSearchParams 构建
        const params = new URLSearchParams({
            anomaly_type: anomalyType,
            limit: limit.toString(),
            page: currentPage.toString()
        });

        const response = await fetch(`/api/samples?${params}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // 计算总页数
        totalPages = Math.ceil(data.total / limit) || 1;

        // 更新分页信息显示
        pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;

        // 控制分页按钮状态
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages;

        // 控制分页容器显示/隐藏
        if (data.total > 0) {
            paginationContainer.classList.remove('hidden');
        } else {
            paginationContainer.classList.add('hidden');
        }

        // 渲染图表
        renderCharts(data.samples);

        statusText.textContent = `已加载 ${data.returned} 个样本（共 ${data.total} 个匹配）`;

    } catch (error) {
        console.error('加载数据失败:', error);
        statusText.textContent = `加载失败: ${error.message}`;
    } finally {
        // 恢复按钮状态
        loadBtn.disabled = false;
        loadBtn.textContent = '加载数据';
    }
}

// ============================================================================
// 第五部分：图表渲染
// ============================================================================

/**
 * 渲染所有样本的图表
 *
 * @param {Array} samples - 样本数组
 */
function renderCharts(samples) {
    // 清空容器
    chartsContainer.innerHTML = '';

    if (samples.length === 0) {
        chartsContainer.innerHTML = `
            <div class="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                <p>没有找到匹配的样本</p>
            </div>
        `;
        return;
    }

    // 遍历样本，为每个样本创建图表
    samples.forEach(function(sample, index) {
        renderSingleChart(sample, index + 1);
    });
}

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

// ============================================================================
// 第六部分：辅助函数
// ============================================================================

/**
 * 计算异常区间
 *
 * 从 labels 数组中识别连续的异常区间
 *
 * @param {Array} labels - 标签数组（0 表示正常，1 表示异常）
 * @returns {Array} 异常区间数组，每个元素包含 start 和 end
 *
 * 示例：
 * 输入: [0, 0, 1, 1, 0, 1, 0, 0]
 * 输出: [{start: 2, end: 3}, {start: 5, end: 5}]
 */
function computeAnomalyRegions(labels) {
    const regions = [];
    let start = -1;  // 当前异常区间的起始位置

    // 遍历标签数组
    for (let i = 0; i < labels.length; i++) {
        if (labels[i] === 1 && start === -1) {
            // 发现异常点，且不在异常区间内 -> 开始新区间
            start = i;
        } else if (labels[i] === 0 && start !== -1) {
            // 发现正常点，且在异常区间内 -> 结束当前区间
            regions.push({ start: start, end: i - 1 });
            start = -1;
        }
    }

    // 处理序列末尾的异常区间
    if (start !== -1) {
        regions.push({ start: start, end: labels.length - 1 });
    }

    return regions;
}
