// 全局变量
let datasets = {};
let chart1_1, chart1_2, chart2, chart3;  // 四个图表实例
let currentData1 = null;  // 目录1的数据
let currentData2 = null;  // 目录2的数据

// DOM 元素 (保持不变)
const datasetSelect = document.getElementById('datasetSelect');
const sampleSelect = document.getElementById('sampleSelect');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMessage = document.getElementById('errorMessage');
const sampleInfo = document.getElementById('sampleInfo');
const dataLengthSpan = document.getElementById('dataLength');
const anomalyCountSpan = document.getElementById('anomalyCount');

// 初始化 (保持不变)
document.addEventListener('DOMContentLoaded', async () => {
    initCharts();
    await loadDatasets();
    setupEventListeners();
    setupKeyboardNavigation();
});

// 初始化图表
function initCharts() {
    chart1_1 = echarts.init(document.getElementById('chart1_1'));
    chart1_2 = echarts.init(document.getElementById('chart1_2'));
    chart2 = echarts.init(document.getElementById('chart2'));
    chart3 = echarts.init(document.getElementById('chart3'));

    // 窗口大小改变时重绘图表
    window.addEventListener('resize', () => {
        chart1_1.resize();
        chart1_2.resize();
        chart2.resize();
        chart3.resize();
    });

    // 显示空状态
    showEmptyCharts();
}

// 显示空状态图表
function showEmptyCharts() {
    const emptyOption = {
        title: {
            text: '请选择数据集和样本',
            left: 'center',
            top: 'center',
            textStyle: {
                color: '#999',
                fontSize: 14
            }
        }
    };
    chart1_1.setOption(emptyOption);
    chart1_2.setOption(emptyOption);
    chart2.setOption(emptyOption);
    chart3.setOption(emptyOption);
}

// 加载数据集列表 (保持不变)
async function loadDatasets() {
    try {
        const response = await fetch('/api/datasets');
        datasets = await response.json();

        // 填充数据集下拉框
        Object.keys(datasets).sort().forEach(dataset => {
            const option = document.createElement('option');
            option.value = dataset;
            option.textContent = `${dataset} (${datasets[dataset].length})`;
            datasetSelect.appendChild(option);
        });
    } catch (error) {
        showError('加载数据集列表失败: ' + error.message);
        datasetSelect.disabled = true;
    }
}

// 设置事件监听器 (保持不变)
function setupEventListeners() {
    datasetSelect.addEventListener('change', onDatasetChange);
    sampleSelect.addEventListener('change', onSampleChange);
}

// 数据集选择变化 (保持不变)
function onDatasetChange() {
    const dataset = datasetSelect.value;

    // 重置样本下拉框
    sampleSelect.innerHTML = '<option value="">请选择样本</option>';

    if (!dataset) {
        sampleSelect.disabled = true;
        sampleInfo.classList.add('hidden');
        showEmptyCharts();
        return;
    }

    // 填充样本下拉框
    const samples = datasets[dataset];
    
    // 使用 localeCompare 开启 numeric 选项进行自然排序
    samples.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).forEach(sample => {
        const option = document.createElement('option');
        option.value = sample;
        option.textContent = sample;
        sampleSelect.appendChild(option);
    });

    sampleSelect.disabled = false;
}

// 样本选择变化
async function onSampleChange() {
    const dataset = datasetSelect.value;
    const sampleId = sampleSelect.value;

    if (!sampleId) {
        sampleInfo.classList.add('hidden');
        showEmptyCharts();
        return;
    }

    showLoading(true);
    hideError();

    try {
        // 并行加载两个目录的数据
        const [response1, response2] = await Promise.all([
            fetch(`/api/data/0/${dataset}/${sampleId}`),
            fetch(`/api/data/1/${dataset}/${sampleId}`)
        ]);

        if (!response1.ok || !response2.ok) {
            throw new Error('数据加载失败');
        }

        currentData1 = await response1.json();
        currentData2 = await response2.json();

        updateCharts();
        updateSampleInfo();
    } catch (error) {
        showToast('加载数据失败: ' + error.message, 'error');
        showEmptyCharts();
    } finally {
        showLoading(false);
    }
}

// 更新样本信息
function updateSampleInfo() {
    if (!currentData2) return;

    dataLengthSpan.textContent = currentData2.value.length.toLocaleString();
    anomalyCountSpan.textContent = currentData2.label.filter(l => l === 1).length.toLocaleString();
    sampleInfo.classList.remove('hidden');
}

// 显示/隐藏加载状态 (保持不变)
function showLoading(show) {
    loadingSpinner.classList.toggle('hidden', !show);
}

// 显示错误信息 (保持不变)
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

// 隐藏错误信息 (保持不变)
function hideError() {
    errorMessage.classList.add('hidden');
}

// 显示 Toast 通知 (保持不变)
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // 触发动画
    setTimeout(() => toast.classList.add('show'), 10);

    // 3秒后移除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 更新所有图表
function updateCharts() {
    if (!currentData1 || !currentData2) return;

    updateChart1_1();  // 目录1的时序图
    updateChart1_2();  // 目录2的时序图
    updateChart2();    // 目录2的直方图
    updateChart3();    // 目录2的散点图
}


/**
 * 【重构核心】：图一，时序与异常分数对齐图，采用 Multi-Grid 垂直联动的出版级布局
 * 目录1的数据
 */
function updateChart1_1() {
    const { value, label, anomaly_score } = currentData1;
    const xData = Array.from({ length: value.length }, (_, i) => i);

    // 【第一步：精准分类提取“连续区间”和“单个异常点”】
    const markAreasData = []; // 存放连续区间（长度 >= 2）
    const markLinesData = []; // 存放单个异常点（长度 == 1）
    let start = -1;

    for (let i = 0; i < label.length; i++) {
        if (label[i] === 1 && start === -1) {
            start = i; // 记录异常的起点
        } else if (label[i] === 0 && start !== -1) {
            const end = i - 1; // 异常结束
            if (start === end) {
                // 如果起点和终点是同一个索引，说明是【单个异常点】
                markLinesData.push({ xAxis: start });
            } else {
                // 如果起点和终点不同，说明是【连续异常区间】
                markAreasData.push([{ xAxis: start }, { xAxis: end }]);
            }
            start = -1; // 重置起点
        }
    }
    // 处理序列末尾正好是异常的情况
    if (start !== -1) {
        const end = label.length - 1;
        if (start === end) {
            markLinesData.push({ xAxis: start });
        } else {
            markAreasData.push([{ xAxis: start }, { xAxis: end }]);
        }
    }

    // 【第二步：分别定义上半图（原始信号）和下半图（异常分数）的红底与红线】
    
    // 1. 上半部分：为了不遮挡蓝色的原始信号线，颜色用浅红色，线也用浅色
    const topMarkArea = { silent: true, itemStyle: { color: 'rgba(255, 0, 0, 0.3)' }, data: markAreasData };
    const topMarkLine = {
        silent: true,
        symbol: 'none', // 不显示两端的箭头或圆点
        lineStyle: { color: 'rgba(255, 0, 0, 0.5)', type: 'solid', width: 2 }, // 强制2像素宽的实线，确保可见
        data: markLinesData
    };

    // 2. 下半部分：为了形成强烈视觉冲击，颜色用深红色，线也用深色
    const bottomMarkArea = { silent: true, itemStyle: { color: 'rgba(255, 0, 0, 0.9)' }, data: markAreasData };
    const bottomMarkLine = {
        silent: true,
        symbol: 'none',
        lineStyle: { color: 'rgba(255, 0, 0, 0.9)', type: 'solid', width: 2 }, // 深色2像素粗线
        data: markLinesData
    };

    // 【第三步：构建 ECharts 渲染配置】
    const option = {
        animation: false,
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { data: ['原始信号', '异常分数'], top: 10 },
        // 上下分栏布局
        grid: [
            { left: 70, right: 30, top: 50, height: 140 },
            { left: 70, right: 30, top: 220, height: 80 }
        ],
        xAxis: [
            { type: 'category', data: xData, gridIndex: 0, axisLabel: { show: false }, axisTick: { show: false } },
            { type: 'category', data: xData, gridIndex: 1, name: '时间步', nameLocation: 'middle', nameGap: 30 }
        ],
        yAxis: [
            { type: 'value', name: '原始信号', nameLocation: 'middle', nameGap: 50, gridIndex: 0, axisLine: { show: true, lineStyle: { color: '#0000ff' } }, splitLine: { show: true, lineStyle: { type: 'dashed' } } },
            { type: 'value', name: '异常分数', nameLocation: 'middle', nameGap: 50, min: 0, max: 1, gridIndex: 1, axisLine: { show: true, lineStyle: { color: '#008000' } }, splitLine: { show: false } }
        ],
        dataZoom: [
            { type: 'slider', xAxisIndex: [0, 1], start: 0, end: 100, height: 20, bottom: 8 },
            { type: 'inside', xAxisIndex: [0, 1], zoomOnMouseWheel: true, moveOnMouseMove: true }
        ],
        series: [
            {
                name: '原始信号',
                type: 'line',
                xAxisIndex: 0,
                yAxisIndex: 0,
                data: value,
                large: true,
                progressive: 3000,
                symbol: 'none',
                lineStyle: { width: 1.5 },
                itemStyle: { color: '#0000ff' }, // 蓝色
                // 【核心挂载】：同时挂载面积（处理区间）和线（处理单点）
                markArea: markAreasData.length > 0 ? topMarkArea : undefined,
                markLine: markLinesData.length > 0 ? topMarkLine : undefined
            },
            {
                name: '异常分数',
                type: 'line',
                xAxisIndex: 1,
                yAxisIndex: 1,
                data: anomaly_score,
                large: true,
                progressive: 3000,
                symbol: 'none',
                lineStyle: { width: 1.5 },
                itemStyle: { color: '#008000' }, // 绿色
                // 【核心挂载】：同时挂载面积（处理区间）和线（处理单点）
                markArea: markAreasData.length > 0 ? bottomMarkArea : undefined,
                markLine: markLinesData.length > 0 ? bottomMarkLine : undefined
            }
        ]
    };

    chart1_1.setOption(option, true);
}

/**
 * 图一-2，时序与异常分数对齐图
 * 目录2的数据
 */
function updateChart1_2() {
    const { value, label, anomaly_score } = currentData2;
    const xData = Array.from({ length: value.length }, (_, i) => i);

    // 【第一步：精准分类提取"连续区间"和"单个异常点"】
    const markAreasData = []; // 存放连续区间（长度 >= 2）
    const markLinesData = []; // 存放单个异常点（长度 == 1）
    let start = -1;

    for (let i = 0; i < label.length; i++) {
        if (label[i] === 1 && start === -1) {
            start = i; // 记录异常的起点
        } else if (label[i] === 0 && start !== -1) {
            const end = i - 1; // 异常结束
            if (start === end) {
                // 如果起点和终点是同一个索引，说明是【单个异常点】
                markLinesData.push({ xAxis: start });
            } else {
                // 如果起点和终点不同，说明是【连续异常区间】
                markAreasData.push([{ xAxis: start }, { xAxis: end }]);
            }
            start = -1; // 重置起点
        }
    }
    // 处理序列末尾正好是异常的情况
    if (start !== -1) {
        const end = label.length - 1;
        if (start === end) {
            markLinesData.push({ xAxis: start });
        } else {
            markAreasData.push([{ xAxis: start }, { xAxis: end }]);
        }
    }

    // 【第二步：分别定义上半图（原始信号）和下半图（异常分数）的红底与红线】

    // 1. 上半部分：为了不遮挡蓝色的原始信号线，颜色用浅红色，线也用浅色
    const topMarkArea = { silent: true, itemStyle: { color: 'rgba(255, 0, 0, 0.3)' }, data: markAreasData };
    const topMarkLine = {
        silent: true,
        symbol: 'none', // 不显示两端的箭头或圆点
        lineStyle: { color: 'rgba(255, 0, 0, 0.5)', type: 'solid', width: 2 }, // 强制2像素宽的实线，确保可见
        data: markLinesData
    };

    // 2. 下半部分：为了形成强烈视觉冲击，颜色用深红色，线也用深色
    const bottomMarkArea = { silent: true, itemStyle: { color: 'rgba(255, 0, 0, 0.9)' }, data: markAreasData };
    const bottomMarkLine = {
        silent: true,
        symbol: 'none',
        lineStyle: { color: 'rgba(255, 0, 0, 0.9)', type: 'solid', width: 2 }, // 深色2像素粗线
        data: markLinesData
    };

    // 【第三步：构建 ECharts 渲染配置】
    const option = {
        animation: false,
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { data: ['原始信号', '异常分数'], top: 10 },
        // 上下分栏布局
        grid: [
            { left: 70, right: 30, top: 50, height: 140 },
            { left: 70, right: 30, top: 220, height: 80 }
        ],
        xAxis: [
            { type: 'category', data: xData, gridIndex: 0, axisLabel: { show: false }, axisTick: { show: false } },
            { type: 'category', data: xData, gridIndex: 1, name: '时间步', nameLocation: 'middle', nameGap: 30 }
        ],
        yAxis: [
            { type: 'value', name: '原始信号', nameLocation: 'middle', nameGap: 50, gridIndex: 0, axisLine: { show: true, lineStyle: { color: '#0000ff' } }, splitLine: { show: true, lineStyle: { type: 'dashed' } } },
            { type: 'value', name: '异常分数', nameLocation: 'middle', nameGap: 50, min: 0, max: 1, gridIndex: 1, axisLine: { show: true, lineStyle: { color: '#008000' } }, splitLine: { show: false } }
        ],
        dataZoom: [
            { type: 'slider', xAxisIndex: [0, 1], start: 0, end: 100, height: 20, bottom: 8 },
            { type: 'inside', xAxisIndex: [0, 1], zoomOnMouseWheel: true, moveOnMouseMove: true }
        ],
        series: [
            {
                name: '原始信号',
                type: 'line',
                xAxisIndex: 0,
                yAxisIndex: 0,
                data: value,
                large: true,
                progressive: 3000,
                symbol: 'none',
                lineStyle: { width: 1.5 },
                itemStyle: { color: '#0000ff' }, // 蓝色
                // 【核心挂载】：同时挂载面积（处理区间）和线（处理单点）
                markArea: markAreasData.length > 0 ? topMarkArea : undefined,
                markLine: markLinesData.length > 0 ? topMarkLine : undefined
            },
            {
                name: '异常分数',
                type: 'line',
                xAxisIndex: 1,
                yAxisIndex: 1,
                data: anomaly_score,
                large: true,
                progressive: 3000,
                symbol: 'none',
                lineStyle: { width: 1.5 },
                itemStyle: { color: '#008000' }, // 绿色
                // 【核心挂载】：同时挂载面积（处理区间）和线（处理单点）
                markArea: markAreasData.length > 0 ? bottomMarkArea : undefined,
                markLine: markLinesData.length > 0 ? bottomMarkLine : undefined
            }
        ]
    };

    chart1_2.setOption(option, true);
}

// 图二：区分度分析直方图（已完美重构：双 Y 轴解耦数量级 + 过滤 Padding + 消除 0 残留）
function updateChart2() {
    const { label, anomaly_score } = currentData2;

    // 1. 分离真正常和真异常分数（显式排除 label === -1 的 Padding 数据）
    const normalScores = [];
    const anomalyScores = [];

    for (let i = 0; i < label.length; i++) {
        if (label[i] === 0) {
            normalScores.push(anomaly_score[i]);
        } else if (label[i] === 1) { 
            anomalyScores.push(anomaly_score[i]);
        }
    }

    // 防御机制：如果过滤后没有任何有效数据，直接展示空状态
    if (normalScores.length === 0 && anomalyScores.length === 0) {
        showEmptyCharts();
        return;
    }

    // 2. 动态计算直方图分箱
    const bins = 50;
    const validScores = [...normalScores, ...anomalyScores];
    const minScore = Math.min(...validScores);
    const maxScore = Math.max(...validScores);
    const binWidth = (maxScore - minScore) / bins || 0.001;

    // 初始化临时分箱容器
    const normalCounts = new Array(bins).fill(0);
    const anomalyCounts = new Array(bins).fill(0);
    const xLabels = [];

    for (let i = 0; i < bins; i++) {
        xLabels.push((minScore + i * binWidth).toFixed(3));
    }

    // 统计频数
    normalScores.forEach(score => {
        const binIndex = Math.min(Math.floor((score - minScore) / binWidth), bins - 1);
        if (binIndex >= 0) normalCounts[binIndex]++;
    });

    anomalyScores.forEach(score => {
        const binIndex = Math.min(Math.floor((score - minScore) / binWidth), bins - 1);
        if (binIndex >= 0) anomalyCounts[binIndex]++;
    });

    // 3. 清洗数据，动态剔除频数全为 0 的空分箱
    const finalXLabels = [];
    const finalNormalCounts = [];
    const finalAnomalyCounts = [];

    for (let i = 0; i < bins; i++) {
        // 只有当正常点或异常点至少有一个数量大于 0 时，才保留该区间
        if (normalCounts[i] > 0 || anomalyCounts[i] > 0) {
            finalXLabels.push(xLabels[i]);
            
            // 如果正常点频数为 0，抹除柱体和边框线残留
            if (normalCounts[i] === 0) {
                finalNormalCounts.push({
                    value: 0,
                    itemStyle: { color: 'transparent', borderColor: 'transparent' }
                });
            } else {
                finalNormalCounts.push(normalCounts[i]);
            }
            
            // 如果异常点频数为 0，同样抹除残留
            if (anomalyCounts[i] === 0) {
                finalAnomalyCounts.push({
                    value: 0,
                    itemStyle: { color: 'transparent', borderColor: 'transparent' }
                });
            } else {
                finalAnomalyCounts.push(anomalyCounts[i]);
            }
        }
    }

    // 4. 构建 ECharts 配置（双 Y 轴核心配置）
    const option = {
        animation: false,
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
        },
        legend: {
            data: [`正常 (${normalScores.length})`, `异常 (${anomalyScores.length})`],
            top: 10
        },
        // 【优化】：因为右侧多了 Y 轴坐标和标签，将右边距 right 从 30 扩大到 60，防止文字溢出裁剪
        grid: {
            left: 60,
            right: 60, 
            top: 50,
            bottom: 60
        },
        xAxis: {
            type: 'category',
            data: finalXLabels,
            name: '异常分数',
            nameLocation: 'middle',
            nameGap: 30,
            axisLabel: {
                rotate: 45,
                interval: 0 
            }
        },
        // 【核心修改】：定义左右对称的双 Y 轴
        yAxis: [
            {
                type: 'value',
                name: '正常点频数',
                nameLocation: 'middle',
                nameGap: 40,
                axisLine: { show: true, lineStyle: { color: '#3b82f6' } }, // 轴线颜色与蓝色柱子对应
                splitLine: { show: true, lineStyle: { type: 'dashed' } }  // 保留左轴的背景网格线
            },
            {
                type: 'value',
                name: '异常点频数',
                nameLocation: 'middle',
                nameGap: 40,
                axisLine: { show: true, lineStyle: { color: '#ef4444' } }, // 轴线颜色与红色柱子对应
                splitLine: { show: false } // 【关键】：隐藏右轴的网格线，防止与左轴的网格线交织错乱
            }
        ],
        series: [
            {
                name: `正常 (${normalScores.length})`,
                type: 'bar',
                yAxisIndex: 0, // 【映射】：绑定到左边的第 0 个 Y 轴
                data: finalNormalCounts,
                itemStyle: {
                    color: 'rgba(59, 130, 246, 0.5)',
                    borderColor: '#3b82f6'
                },
                barWidth: '40%' // 稍微缩小宽度，防止双轴柱体完全重叠阻挡
            },
            {
                name: `异常 (${anomalyScores.length})`,
                type: 'bar',
                yAxisIndex: 1, // 【映射】：绑定到右边的第 1 个 Y 轴
                data: finalAnomalyCounts,
                itemStyle: {
                    color: 'rgba(239, 68, 68, 0.5)',
                    borderColor: '#ef4444'
                },
                barWidth: '40%'
            }
        ]
    };

    chart2.setOption(option, true);
}

// 图三：关联性散点图
function updateChart3() {
    const { value, anomaly_score } = currentData2;

    // 计算散点数据 [abs(value), anomaly_score]
    const scatterData = [];
    for (let i = 0; i < value.length; i++) {
        scatterData.push([Math.abs(value[i]), anomaly_score[i]]);
    }

    const option = {
        animation: false,
        tooltip: {
            trigger: 'item',
            formatter: params => `|value|: ${params.value[0].toFixed(4)}<br/>score: ${params.value[1].toFixed(4)}`
        },
        grid: {
            left: 70,
            right: 30,
            top: 30,
            bottom: 80
        },
        xAxis: {
            type: 'value',
            name: '|value|',
            nameLocation: 'middle',
            nameGap: 40
        },
        yAxis: {
            type: 'value',
            name: '异常分数',
            nameLocation: 'middle',
            nameGap: 50,
            min: 0,
            max: 1
        },
        dataZoom: [
            {
                type: 'slider',
                xAxisIndex: 0,
                start: 0,
                end: 100,
                height: 20,
                bottom: 10
            },
            {
                type: 'slider',
                yAxisIndex: 0,
                start: 0,
                end: 100,
                width: 20,
                right: 10
            },
            {
                type: 'inside',
                xAxisIndex: 0,
                yAxisIndex: 0
            }
        ],
        series: [{
            type: 'scatter',
            data: scatterData,
            large: true,
            largeThreshold: 2000,
            symbolSize: 3,
            itemStyle: {
                color: 'rgba(59, 130, 246, 0.5)'
            }
        }]
    };

    chart3.setOption(option, true);
}

/**
 * 键盘导航控制（重构版）：
 * - 左右方向键：强制拦截，控制 chart1_1 和 chart1_2 的 dataZoom 滑块平移
 * - 上下方向键：焦点在 SELECT 上时放行原生行为，否则手动切换样本
 */
function setupKeyboardNavigation() {
    document.addEventListener('keydown', function(event) {
        // 只处理方向键
        const arrowKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
        if (!arrowKeys.includes(event.key)) {
            return;
        }

        // ============================================
        // 【优先级最高】左右方向键：强制拦截，控制图表窗口平移
        // 无论焦点是否在下拉框上，都必须拦截浏览器的默认行为
        // ============================================
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            // 检查全局变量是否存在
            if (!currentData1 || !currentData2 || !chart1_1 || !chart1_2) {
                return;
            }

            // 获取当前图表配置
            const option = chart1_1.getOption();
            if (!option.dataZoom || option.dataZoom.length === 0) {
                return;
            }

            // 读取当前滑块的起始百分比
            const zoomOption = option.dataZoom[0];
            let start = zoomOption.start;
            let end = zoomOption.end;

            // 计算当前窗口显示的区间跨度
            const range = end - start;

            // 定义滑动步长（每次移动 2%）
            const step = 2;

            // 根据按键方向计算新位置
            if (event.key === 'ArrowLeft') {
                // 向左移动：start 减去步长，确保不小于 0
                start = Math.max(0, start - step);
                end = start + range;
            } else if (event.key === 'ArrowRight') {
                // 向右移动：end 加上步长，确保不大于 100
                end = Math.min(100, end + step);
                start = end - range;
            }

            // 触发 ECharts 重绘（两个时序图同步缩放）
            chart1_1.dispatchAction({
                type: 'dataZoom',
                dataZoomIndex: 0,
                start: start,
                end: end
            });
            chart1_2.dispatchAction({
                type: 'dataZoom',
                dataZoomIndex: 0,
                start: start,
                end: end
            });

            // 【关键】强制拦截浏览器默认行为，防止在下拉框中切换选项
            event.preventDefault();
            return;
        }

        // ============================================
        // 【次级优先级】上下方向键：根据焦点状态决定行为
        // ============================================
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            // 焦点在 SELECT 上时：放行，让浏览器执行原生的切换选项行为
            if (document.activeElement.tagName === 'SELECT') {
                return;
            }

            // 焦点不在 SELECT 上时：手动切换样本
            // 检查是否已选择数据集
            if (!datasetSelect.value) {
                return;
            }

            const options = sampleSelect.options;
            const currentIndex = sampleSelect.selectedIndex;

            // 计算新的索引
            let newIndex;
            if (event.key === 'ArrowUp') {
                // 向上：选择上一个样本（跳过第一个"请选择样本"选项）
                newIndex = Math.max(1, currentIndex - 1);
            } else {
                // 向下：选择下一个样本
                newIndex = Math.min(options.length - 1, currentIndex + 1);
            }

            // 如果索引没有变化，直接返回
            if (newIndex === currentIndex) {
                return;
            }

            // 更新选中项并触发 change 事件
            sampleSelect.selectedIndex = newIndex;
            sampleSelect.dispatchEvent(new Event('change'));

            event.preventDefault();
        }
    });
}