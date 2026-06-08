// 全局变量 (保持不变)
let datasets = {};
let chart1, chart2, chart3;
let currentData = null;

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
});

// 初始化图表 (保持不变)
function initCharts() {
    chart1 = echarts.init(document.getElementById('chart1'));
    chart2 = echarts.init(document.getElementById('chart2'));
    chart3 = echarts.init(document.getElementById('chart3'));

    // 窗口大小改变时重绘图表
    window.addEventListener('resize', () => {
        chart1.resize();
        chart2.resize();
        chart3.resize();
    });

    // 显示空状态
    showEmptyCharts();
}

// 显示空状态图表 (保持不变)
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
    chart1.setOption(emptyOption);
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
    samples.sort().forEach(sample => {
        const option = document.createElement('option');
        option.value = sample;
        option.textContent = sample;
        sampleSelect.appendChild(option);
    });

    sampleSelect.disabled = false;
}

// 样本选择变化 (保持不变)
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
        const response = await fetch(`/api/data/${dataset}/${sampleId}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        currentData = await response.json();
        updateCharts();
        updateSampleInfo();
    } catch (error) {
        showToast('加载数据失败: ' + error.message, 'error');
        showEmptyCharts();
    } finally {
        showLoading(false);
    }
}

// 更新样本信息 (保持不变)
function updateSampleInfo() {
    if (!currentData) return;

    dataLengthSpan.textContent = currentData.value.length.toLocaleString();
    anomalyCountSpan.textContent = currentData.label.filter(l => l === 1).length.toLocaleString();
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

// 更新所有图表 (保持不变)
function updateCharts() {
    if (!currentData) return;

    updateChart1();
    updateChart2();
    updateChart3();
}


/**
 * 【重构核心】：图一，时序与异常分数对齐图，采用 Multi-Grid 垂直联动的出版级布局
 * 用于生成目标图片 image_3.png 的效果
 */
function updateChart1() {
    const { value, label, anomaly_score } = currentData;
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

    chart1.setOption(option, true);
}

// 图二：区分度分析直方图 (保持不变)
function updateChart2() {
    const { label, anomaly_score } = currentData;

    // 分离正常和异常分数
    const normalScores = [];
    const anomalyScores = [];

    for (let i = 0; i < label.length; i++) {
        if (label[i] === 0) {
            normalScores.push(anomaly_score[i]);
        } else {
            anomalyScores.push(anomaly_score[i]);
        }
    }

    // 计算直方图分箱
    const bins = 50;
    const allScores = anomaly_score;
    const minScore = Math.min(...allScores);
    const maxScore = Math.max(...allScores);
    const binWidth = (maxScore - minScore) / bins;

    // 初始化分箱
    const normalCounts = new Array(bins).fill(0);
    const anomalyCounts = new Array(bins).fill(0);
    const xLabels = [];

    for (let i = 0; i < bins; i++) {
        xLabels.push((minScore + i * binWidth).toFixed(3));
    }

    // 统计频数
    normalScores.forEach(score => {
        const binIndex = Math.min(Math.floor((score - minScore) / binWidth), bins - 1);
        normalCounts[binIndex]++;
    });

    anomalyScores.forEach(score => {
        const binIndex = Math.min(Math.floor((score - minScore) / binWidth), bins - 1);
        anomalyCounts[binIndex]++;
    });

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
        grid: {
            left: 60,
            right: 30,
            top: 50,
            bottom: 60
        },
        xAxis: {
            type: 'category',
            data: xLabels,
            name: '异常分数',
            nameLocation: 'middle',
            nameGap: 30,
            axisLabel: {
                rotate: 45,
                interval: Math.floor(bins / 10)
            }
        },
        yAxis: {
            type: 'value',
            name: '频数',
            nameLocation: 'middle',
            nameGap: 40
        },
        series: [
            {
                name: `正常 (${normalScores.length})`,
                type: 'bar',
                data: normalCounts,
                itemStyle: {
                    color: 'rgba(59, 130, 246, 0.5)',
                    borderColor: '#3b82f6'
                },
                barWidth: '60%'
            },
            {
                name: `异常 (${anomalyScores.length})`,
                type: 'bar',
                data: anomalyCounts,
                itemStyle: {
                    color: 'rgba(239, 68, 68, 0.5)',
                    borderColor: '#ef4444'
                },
                barWidth: '60%'
            }
        ]
    };

    chart2.setOption(option, true);
}

// 图三：关联性散点图 (保持不变)
function updateChart3() {
    const { value, anomaly_score } = currentData;

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