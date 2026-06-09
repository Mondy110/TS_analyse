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

// DOM 元素引用（页面加载完成后初始化）
let anomalyTypeSelect;   // 异常类型下拉框
let limitSelect;         // 数量选择下拉框
let loadBtn;             // 加载按钮
let statusText;          // 状态提示文本
let chartsContainer;     // 图表容器
let placeholder;         // 占位提示元素

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
    anomalyTypeSelect = document.getElementById('anomaly-type');
    limitSelect = document.getElementById('limit');
    loadBtn = document.getElementById('load-btn');
    statusText = document.getElementById('status-text');
    chartsContainer = document.getElementById('charts-container');
    placeholder = document.getElementById('placeholder');

    // 绑定事件监听器
    loadBtn.addEventListener('click', handleLoadData);

    // 加载异常类型列表
    loadAnomalyTypes();
});

// ============================================================================
// 第三部分：异常类型加载
// ============================================================================

/**
 * 从后端加载异常类型列表
 *
 * 使用 Fetch API 发送 GET 请求到 /api/anomaly_types
 * 然后填充到下拉框中
 */
async function loadAnomalyTypes() {
    try {
        statusText.textContent = '正在加载异常类型...';

        // Fetch API 发送请求
        // await 等待请求完成
        const response = await fetch('/api/anomaly_types');

        // 检查响应状态
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // 解析 JSON 响应
        const data = await response.json();

        // 清空下拉框
        anomalyTypeSelect.innerHTML = '';

        // 添加选项
        // data.anomaly_types 是异常类型数组
        data.anomaly_types.forEach(function(type) {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            anomalyTypeSelect.appendChild(option);
        });

        statusText.textContent = `已加载 ${data.anomaly_types.length} 种异常类型`;

    } catch (error) {
        console.error('加载异常类型失败:', error);
        statusText.textContent = '加载异常类型失败，请刷新页面重试';
        anomalyTypeSelect.innerHTML = '<option value="">加载失败</option>';
    }
}

// ============================================================================
// 第四部分：数据加载处理
// ============================================================================

/**
 * 处理"加载数据"按钮点击事件
 *
 * 1. 获取选中的异常类型和数量
 * 2. 发送请求到后端
 * 3. 渲染图表
 */
async function handleLoadData() {
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
            limit: limit.toString()
        });

        const response = await fetch(`/api/samples?${params}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

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
 * 渲染单个样本的图表
 *
 * @param {Object} sample - 单个样本数据
 * @param {number} index - 样本序号
 */
function renderSingleChart(sample, index) {
    // 创建图表容器
    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'w-full h-[600px] bg-white rounded-lg shadow p-4';
    chartWrapper.innerHTML = `
        <div class="text-sm text-gray-600 mb-2">
            样本 #${index} |
            序列长度: ${sample.time_series.length} |
            异常点数: ${sample.labels.filter(l => l === 1).length}
        </div>
        <div id="chart-${index}" style="width: 100%; height: 550px;"></div>
    `;
    chartsContainer.appendChild(chartWrapper);

    // 初始化 ECharts
    const chartDom = document.getElementById(`chart-${index}`);
    const myChart = echarts.init(chartDom);

    // 生成 X 轴索引数组
    const indices = Array.from({ length: sample.time_series.length }, (_, i) => i);

    // 计算异常区间
    const anomalyRegions = computeAnomalyRegions(sample.labels);

    // 构建 markArea 数据（异常区间）
    const markAreaData = anomalyRegions.map(region => [
        { coord: [region.start, 'min'] },
        { coord: [region.end, 'max'] }
    ]);

    // 构建 markPoint 数据（异常点）
    const markPointData = [];
    sample.labels.forEach(function(label, i) {
        if (label === 1) {
            markPointData.push({
                coord: [i, sample.time_series[i]],
                itemStyle: { color: '#ef4444' },
                symbolSize: 10
            });
        }
    });

    // ECharts 配置项
    const option = {
        // 标题配置
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
                top: '52%',
                textStyle: { fontSize: 14, color: '#10b981' }
            }
        ],

        // 提示框配置
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' }
        },

        // 图例配置
        legend: {
            data: ['Normal', 'Anomaly'],
            top: 30
        },

        // 双网格布局
        grid: [
            // 上方网格：纯净序列
            {
                left: '10%',
                right: '5%',
                top: '15%',
                height: '30%'
            },
            // 下方网格：含异常序列
            {
                left: '10%',
                right: '5%',
                top: '60%',
                height: '30%'
            }
        ],

        // X 轴配置
        xAxis: [
            {
                type: 'category',
                gridIndex: 0,
                data: indices,
                axisLabel: { show: false }
            },
            {
                type: 'category',
                gridIndex: 1,
                data: indices,
                axisLabel: { show: true }
            }
        ],

        // Y 轴配置
        yAxis: [
            { type: 'value', gridIndex: 0 },
            { type: 'value', gridIndex: 1 }
        ],

        // 数据系列
        series: [
            // 上方：纯净序列
            {
                name: 'Normal',
                type: 'line',
                xAxisIndex: 0,
                yAxisIndex: 0,
                data: sample.normal_time_series,
                lineStyle: { color: '#3b82f6', width: 1 },
                showSymbol: false
            },
            // 下方：含异常序列
            {
                name: 'Anomaly',
                type: 'line',
                xAxisIndex: 1,
                yAxisIndex: 1,
                data: sample.time_series,
                lineStyle: { color: '#10b981', width: 1 },
                showSymbol: false,
                // 异常区间标记（半透明红色区域）
                markArea: {
                    data: markAreaData,
                    itemStyle: {
                        color: 'rgba(239, 68, 68, 0.3)'
                    }
                },
                // 异常点标记（红色圆点）
                markPoint: {
                    data: markPointData,
                    symbol: 'circle',
                    symbolSize: 10
                }
            }
        ],

        // 缩放组件
        dataZoom: [
            {
                type: 'slider',
                xAxisIndex: [0, 1],
                bottom: 20,
                height: 20
            }
        ]
    };

    // 应用配置项并渲染
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
