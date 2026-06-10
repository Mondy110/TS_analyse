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
        categorySelect.innerHTML = '';

        const categories = Object.keys(hierarchicalTypes);
        categories.forEach(function(category) {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });

        // 自动选择第一个一级分类并触发联动
        if (categories.length > 0) {
            categorySelect.value = categories[0];
            handleCategoryChange(); // 自动触发联动，填充二级分类
        } else {
            // 无分类数据时初始化二级下拉框为空
            anomalyTypeSelect.innerHTML = '<option value="">请先选择一级分类</option>';
        }

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
 * 渲染单个样本的图表（左文右图布局 - 完美修复版）
 *
 * @param {Object} sample - 单个样本数据
 * @param {number} index - 样本序号
 */
function renderSingleChart(sample, index) {
    // 【核心修复 1】：将外层容器彻底改为稳固的 Grid 布局（4列），彻底防止 Flex 状态下尺寸计算错乱
    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'w-full grid grid-cols-4 gap-6 bg-white rounded-lg shadow-lg p-6 mb-8 items-start';

    // ==================== 左侧信息面板 (占 4 列中的 1 列) ====================
    const leftPanel = document.createElement('div');
    leftPanel.className = 'col-span-1 flex flex-col overflow-y-auto max-h-[720px] pr-2';

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

    // 区块B: 宏观特征 (Normal Patterns) - 增强版
    const seasonal = fullAttr?.seasonal?.type || sample?.attribute?.seasonal || 'N/A';
    const seasonalAmp = fullAttr?.seasonal?.amplitude != null ? fullAttr.seasonal.amplitude.toFixed(2) : null;
    const seasonalDetail = fullAttr?.seasonal?.detail || null;

    const trend = fullAttr?.trend?.type || sample?.attribute?.trend || 'N/A';
    const trendStart = fullAttr?.trend?.start != null ? fullAttr.trend.start.toFixed(2) : null;
    const trendAmp = fullAttr?.trend?.amplitude != null ? fullAttr.trend.amplitude.toFixed(2) : null;
    const trendDetail = fullAttr?.trend?.detail || null;

    const frequency = fullAttr?.frequency?.type || sample?.attribute?.frequency || 'N/A';
    const frequencyPeriod = fullAttr?.frequency?.period != null ? fullAttr.frequency.period.toFixed(1) : null;
    const frequencyDetail = fullAttr?.frequency?.detail || null;

    const noiseType = fullAttr?.noise?.type || sample?.attribute?.noise || 'N/A';
    const noiseStd = fullAttr?.noise?.std != null ? fullAttr.noise.std.toFixed(3) : 'N/A';
    const noiseDetail = fullAttr?.noise?.detail || null;

    // 辅助函数：生成可折叠详情
    function createDetailToggle(label, detail, uniqueId) {
        if (!detail) return '';
        return `
            <button onclick="toggleDetail('${uniqueId}')"
                    class="text-xs text-blue-600 hover:text-blue-800 underline ml-2">
                展开/收起详情
            </button>
            <div id="${uniqueId}" class="hidden mt-1 p-2 bg-gray-50 rounded text-xs text-gray-600 italic">
                ${detail}
            </div>
        `;
    }

    const normalPatterns = document.createElement('div');
    normalPatterns.className = 'mb-6';
    normalPatterns.innerHTML = `
        <h3 class="text-lg font-bold text-gray-800 mb-3 border-b pb-2">宏观特征 (Normal Patterns)</h3>
        <div class="space-y-3 text-sm text-gray-700">
            <div>
                <p><span class="font-medium">Seasonal:</span> ${seasonal}${seasonalAmp ? ` <span class="text-gray-500">(振幅: ${seasonalAmp})</span>` : ''}</p>
                ${createDetailToggle('seasonal', seasonalDetail, `seasonal-detail-${index}`)}
            </div>
            <div>
                <p><span class="font-medium">Trend:</span> ${trend}${trendStart ? ` <span class="text-gray-500">(起点: ${trendStart}, 振幅: ${trendAmp})</span>` : ''}</p>
                ${createDetailToggle('trend', trendDetail, `trend-detail-${index}`)}
            </div>
            <div>
                <p><span class="font-medium">Frequency:</span> ${frequency}${frequencyPeriod ? ` <span class="text-gray-500">(周期: ${frequencyPeriod} 点)</span>` : ''}</p>
                ${createDetailToggle('frequency', frequencyDetail, `frequency-detail-${index}`)}
            </div>
            <div>
                <p><span class="font-medium">Noise:</span> ${noiseType} <span class="text-gray-500">(标准差: ${noiseStd})</span></p>
                ${createDetailToggle('noise', noiseDetail, `noise-detail-${index}`)}
            </div>
        </div>
    `;
    leftPanel.appendChild(normalPatterns);

    // 区块B2: 背景异常状态 (Background Anomalies)
    const bgSpike = fullAttr?.background_periodic_spike || {};
    const bgNoiseMod = fullAttr?.background_periodic_noise_modulation || {};

    if (bgSpike.enabled || bgNoiseMod.enabled) {
        const bgSection = document.createElement('div');
        bgSection.className = 'mb-6';
        let bgHtml = `<h3 class="text-lg font-bold text-gray-800 mb-3 border-b pb-2">背景异常 (Background)</h3>`;
        bgHtml += `<div class="space-y-2 text-sm text-gray-700">`;
        if (bgSpike.enabled) {
            bgHtml += `<p class="text-amber-700"><span class="font-medium">⚠️ 周期性尖峰:</span> 已启用 (数量: ${bgSpike.count ?? 0})</p>`;
        }
        if (bgNoiseMod.enabled) {
            bgHtml += `<p class="text-amber-700"><span class="font-medium">⚠️ 周期性噪声调制:</span> 已启用 (数量: ${bgNoiseMod.count ?? 0})</p>`;
        }
        bgHtml += `</div>`;
        bgSection.innerHTML = bgHtml;
        leftPanel.appendChild(bgSection);
    }

    // 区块C: 局部异常详情 (Local Anomalies) - 时间轴物理排序版本
    // 核心数据源：sample.attribute.anomalies（绝对存在）
    // 辅助数据源：full_attribute_pool.local（局部异常详情）和 seasonal_anomalies（季节性异常详情）
    const anomaliesObj = sample?.attribute?.anomalies || {};
    const localDetails = fullAttr?.local || [];
    const seasonalAnomalyDetails = fullAttr?.seasonal_anomalies || [];

    const localAnomaliesSection = document.createElement('div');
    localAnomaliesSection.className = 'mb-4';

    let localAnomaliesHtml = `
        <h3 class="text-lg font-bold text-gray-800 mb-3 border-b pb-2">局部异常详情 (Local Anomalies)</h3>
    `;

    // 第一步：转换为结构化数组并提取纯净类型
    const anomalyList = Object.entries(anomaliesObj).map(function([key, range]) {
        // 斩断前缀序号（如 "1_pulse_width_modulation" -> "pulse_width_modulation"）
        const underscoreIndex = key.indexOf('_');
        const pureType = underscoreIndex !== -1 ? key.substring(underscoreIndex + 1) : key;
        return {
            key: key,
            type: pureType,
            start: range[0],
            end: range[1]
        };
    });

    // 第二步：【核心修复】严格按时间轴起点升序排序
    // 确保"异常点 #1, #2"永远对应时序图从左往右的出现顺序
    anomalyList.sort(function(a, b) {
        return a.start - b.start;
    });

    if (anomalyList.length === 0) {
        localAnomaliesHtml += `<p class="text-sm text-gray-500 italic">暂无局部异常信息</p>`;
    } else {
        // 第三步：遍历重排后的数组，使用特征锚定算法匹配描述
        anomalyList.forEach(function(item, idx) {
            // 特征锚定算法：同时查询局部异常(local)和季节性异常(seasonal_anomalies)
            // 优先按位置匹配，其次按类型匹配
            const matchedDetail = localDetails.find(function(d) {
                return d?.position_start === item.start;
            }) || seasonalAnomalyDetails.find(function(d) {
                return d?.start === item.start;
            }) || localDetails.find(function(d) {
                return d?.type === item.type || d?.type === item.key;
            }) || seasonalAnomalyDetails.find(function(d) {
                return d?.type === item.type || d?.type === item.key;
            }) || {};

            // 文本描述兜底保护（seasonal_anomalies 使用 details 字段，local 使用 detail 字段）
            const detail = matchedDetail?.detail || matchedDetail?.details || '通过代码自动合成的标准时间序列异常模式。';

            // 振幅数据保护
            const amplitude = matchedDetail?.amplitude;
            const amplitudeText = amplitude != null ? amplitude.toFixed(2) : null;

            // 第四步：输出高品质卡片
            localAnomaliesHtml += `
                <div class="bg-red-50 border border-red-200 rounded p-3 mb-3">
                    <div class="font-medium text-red-800 mb-1">
                        异常点 #${idx + 1}: ${item.type}
                    </div>
                    <div class="text-xs text-gray-600 space-y-1">
                        <p><span class="font-medium">区间:</span> ${item.start} - ${item.end}</p>
                        ${amplitudeText != null ? `<p><span class="font-medium">振幅:</span> ${amplitudeText}</p>` : ''}
                        <p class="text-gray-700">${detail}</p>
                    </div>
                </div>
            `;
        });
    }

    localAnomaliesSection.innerHTML = localAnomaliesHtml;
    leftPanel.appendChild(localAnomaliesSection);

    // 区块D: 统计信息 (Statistics) - 放在最后
    const stats = fullAttr?.statistics || {};
    const overallAmp = fullAttr?.overall_amplitude != null ? fullAttr.overall_amplitude.toFixed(2) : null;
    const overallBias = fullAttr?.overall_bias != null ? fullAttr.overall_bias.toFixed(2) : null;

    const statsSection = document.createElement('div');
    statsSection.className = 'mb-6';
    statsSection.innerHTML = `
        <h3 class="text-lg font-bold text-gray-800 mb-3 border-b pb-2">统计信息 (Statistics)</h3>
        <div class="space-y-2 text-sm text-gray-700">
            <p><span class="font-medium">均值 (Mean):</span> ${stats.mean ?? 'N/A'}</p>
            <p><span class="font-medium">标准差 (Std):</span> ${stats.std ?? 'N/A'}</p>
            <p><span class="font-medium">最大值:</span> ${stats.max ?? 'N/A'} <span class="text-gray-500">(位置: ${stats.max_pos ?? 'N/A'})</span></p>
            <p><span class="font-medium">最小值:</span> ${stats.min ?? 'N/A'} <span class="text-gray-500">(位置: ${stats.min_pos ?? 'N/A'})</span></p>
            ${overallAmp ? `<p><span class="font-medium">整体振幅:</span> ${overallAmp}</p>` : ''}
            ${overallBias ? `<p><span class="font-medium">整体偏置:</span> ${overallBias}</p>` : ''}
        </div>
    `;
    leftPanel.appendChild(statsSection);

    chartWrapper.appendChild(leftPanel);

    // ==================== 右侧图表区域 (占 4 列中的 3 列) ====================
    // 【核心修复 2】：使用 col-span-3 和 min-w-0 强制约束容器宽度，不给子元素任意扩充的机会
    const rightPanel = document.createElement('div');
    rightPanel.className = 'col-span-3 flex flex-col min-w-0 w-full';

    const chartContainer = document.createElement('div');
    chartContainer.id = `chart-${index}`;
    chartContainer.className = 'w-full';
    chartContainer.style.height = '720px';

    rightPanel.appendChild(chartContainer);
    chartWrapper.appendChild(rightPanel);

    // 将大容器挂载到页面上
    chartsContainer.appendChild(chartWrapper);

    // ==================== ECharts 配置 ====================
    const chartDom = document.getElementById(`chart-${index}`);
    const myChart = echarts.init(chartDom);

    const indices = Array.from({ length: sample.time_series.length }, (_, i) => i);
    const anomalyRegions = computeAnomalyRegions(sample.labels);

    // 精准分类提取：连续区间用 Area，单点异常用 Line 竖线
    const markAreaData = []; // 存放连续区间（长度 >= 2）
    const markLineData = []; // 存放单个异常点（长度 == 1）

    anomalyRegions.forEach(region => {
        if (region.start === region.end) {
            // 如果起点和终点相同，说明是【单个点异常】
            markLineData.push({ xAxis: region.start });
        } else {
            // 如果起点和终点不同，说明是【连续异常区间】
            markAreaData.push([
                { coord: [region.start, 'min'] },
                { coord: [region.end, 'max'] }
            ]);
        }
    });

    const differenceSeries = sample.time_series.map((val, i) => val - sample.normal_time_series[i]);

    const option = {
        title: [
            { text: 'Normal Time Series (纯净序列)', left: 'center', top: 10, textStyle: { fontSize: 14, color: '#3b82f6' } },
            { text: 'Time Series (含异常序列)', left: 'center', top: '34%', textStyle: { fontSize: 14, color: '#10b981' } },
            { text: 'Difference Series (残差序列: 异常 - 纯净)', left: 'center', top: '66%', textStyle: { fontSize: 14, color: '#ec4899' } }
        ],
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { data: ['Normal', 'Anomaly', 'Difference'], top: 30 },
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
            { name: 'Normal', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: sample.normal_time_series, lineStyle: { color: '#3b82f6', width: 1 }, showSymbol: false },
            { name: 'Anomaly', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: sample.time_series, lineStyle: { color: '#10b981', width: 1 }, showSymbol: false, markArea: { data: markAreaData, itemStyle: { color: 'rgba(239, 68, 68, 0.3)' } }, markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: 'rgba(239, 68, 68, 0.3)', type: 'solid', width: 3 }, data: markLineData } },
            { name: 'Difference', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: differenceSeries, lineStyle: { color: '#ec4899', width: 1.2 }, showSymbol: false, markArea: { data: markAreaData, itemStyle: { color: 'rgba(239, 68, 68, 0.3)' } }, markLine: { silent: true, symbol: 'none', label: { show: false }, data: [ { yAxis: 0, lineStyle: { type: 'dashed', color: '#9ca3af', width: 1 } }, ...markLineData.map(item => ({ xAxis: item.xAxis, lineStyle: { color: 'rgba(239, 68, 68, 0.3)', type: 'solid', width: 3 } })) ] } }
        ],
        dataZoom: [
            { type: 'slider', xAxisIndex: [0, 1, 2], bottom: 15, height: 18 },
            { type: 'inside', xAxisIndex: [0, 1, 2], zoomOnMouseWheel: true, moveOnMouseMove: true }
        ]
    };

    myChart.setOption(option);

    // 【核心修复 3】：建立一个 50ms 的延时微任务。等待浏览器将 Grid 容器完全渲染完毕、宽度稳定后，
    // 强制触发一次 ECharts 的 resize()，让图表百分之百完美收合在白卡内。
    setTimeout(() => {
        myChart.resize();
    }, 50);
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

/**
 * 展开/收起详情信息
 *
 * @param {string} elementId - 要切换显示的元素 ID
 */
function toggleDetail(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.toggle('hidden');
    }
}
