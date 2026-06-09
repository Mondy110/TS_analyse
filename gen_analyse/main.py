"""
时间序列异常检测可视化项目 - 后端主程序

本模块提供以下功能：
1. FastAPI 应用初始化和配置
2. 静态文件和模板目录挂载
3. 数据懒加载机制
4. API 路由定义

作者：VETime 项目组
日期：2026-06-08
"""

# ============================================================================
# 第一部分：导入必要的库
# ============================================================================

# FastAPI 核心组件
from fastapi import FastAPI, HTTPException, Query
# 静态文件服务，用于提供 JS、CSS 等静态资源
from fastapi.staticfiles import StaticFiles
# Jinja2 模板引擎，用于渲染 HTML 页面
from fastapi.templating import Jinja2Templates
# Request 对象，用于获取请求信息
from starlette.requests import Request
# 响应类型，用于返回 HTML 页面
from starlette.responses import HTMLResponse

# 数据处理库
import pickle      # 用于加载 pickle 格式的数据文件
import numpy as np # NumPy 数组处理（数据集中的数组格式）
import argparse    # 命令行参数解析

# 类型提示和路径处理
from typing import List, Dict, Any, Optional
from pathlib import Path

# ============================================================================
# 第二部分：FastAPI 应用初始化
# ============================================================================

# 创建 FastAPI 应用实例
# title: 应用名称，显示在 API 文档中
# description: 应用描述
app = FastAPI(
    title="时间序列异常检测可视化",
    description="用于可视化 15 万条时间序列异常检测数据集的 Web 应用"
)

# ============================================================================
# 第三部分：静态文件和模板目录挂载
# ============================================================================

# 获取当前文件所在目录（visualization/）
BASE_DIR = Path(__file__).resolve().parent

# 挂载静态文件目录
# StaticFiles 会将 /static URL 映射到 visualization/static/ 目录
# 这样前端可以通过 /static/app.js 访问 JS 文件
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# 配置 Jinja2 模板引擎
# 指向 visualization/templates/ 目录
templates = Jinja2Templates(directory=BASE_DIR / "templates")

# ============================================================================
# 第四部分：全局变量和数据懒加载机制
# ============================================================================

# 全局数据缓存变量
# _data_cache: 存储加载的数据，初始为 None
# _loading: 加载状态锁，防止并发加载
# _load_error: 存储加载过程中的错误信息
# _data_path: 数据文件路径，通过命令行参数设置
_data_cache: Optional[List[Dict[str, Any]]] = None
_loading: bool = False
_load_error: Optional[str] = None
_data_path: Optional[Path] = None


def get_data() -> List[Dict[str, Any]]:
    """
    懒加载数据函数

    实现按需加载策略：
    1. 首次调用时，从 pickle 文件加载数据到内存
    2. 后续调用直接返回缓存的数据
    3. 使用加载锁防止并发加载

    Returns:
        List[Dict]: 包含所有样本的列表

    Raises:
        HTTPException: 数据加载失败或正在加载中
    """
    global _data_cache, _loading, _load_error

    # 如果数据已加载，直接返回缓存
    if _data_cache is not None:
        return _data_cache

    # 如果正在加载，返回 503 服务不可用
    if _loading:
        raise HTTPException(
            status_code=503,
            detail="数据正在加载中，请稍后重试"
        )

    # 设置加载锁
    _loading = True

    try:
        # 数据文件路径通过命令行参数设置
        if _data_path is None:
            raise HTTPException(
                status_code=500,
                detail="数据路径未设置，请通过 --data-path 参数指定数据文件路径"
            )

        # 使用 pickle 加载数据
        # pickle.load 会反序列化 Python 对象
        with open(_data_path, 'rb') as f:
            _data_cache = pickle.load(f)

        print(f"数据加载成功：共 {_data_cache.__len__()} 个样本")
        return _data_cache

    except Exception as e:
        # 记录错误信息
        _load_error = str(e)
        raise HTTPException(
            status_code=500,
            detail=f"数据加载失败: {e}"
        )
    finally:
        # 无论成功或失败，都释放加载锁
        _loading = False


# ============================================================================
# 第五部分：辅助函数
# ============================================================================

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


def extract_anomaly_types(anomalies: Dict[str, tuple]) -> List[str]:
    """
    从 anomalies 字典中提取异常类型

    anomalies 字典格式示例：
    {
        '0_outlier': (511, 512),
        '1_upward spike': (100, 105)
    }

    提取结果：['outlier', 'upward spike']

    Args:
        anomalies: 异常描述字典

    Returns:
        List[str]: 异常类型列表
    """
    types = []
    for key in anomalies.keys():
        # 使用 split('_', 1) 只分割第一个下划线
        # '0_outlier' -> ['0', 'outlier']
        # '1_upward spike' -> ['1', 'upward spike']
        parts = key.split('_', 1)
        if len(parts) > 1:
            types.append(parts[1])
    return types


def convert_numpy_types(obj: Any) -> Any:
    """
    递归转换 NumPy 类型为 Python 原生类型

    处理以下类型：
    - numpy.ndarray -> list
    - numpy.int* -> int
    - numpy.float* -> float
    - numpy.str_ -> str
    - dict -> 递归处理
    - list/tuple -> 递归处理
    """
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.floating,)):
        return float(obj)
    elif isinstance(obj, np.str_):
        return str(obj)
    elif isinstance(obj, dict):
        return {k: convert_numpy_types(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [convert_numpy_types(item) for item in obj]
    else:
        return obj


def convert_sample_to_json(sample: Dict[str, Any]) -> Dict[str, Any]:
    """
    将样本数据转换为 JSON 可序列化格式

    关键点：
    NumPy 数组不能直接被 FastAPI 序列化为 JSON
    必须使用 .tolist() 方法转换为 Python 原生列表

    Args:
        sample: 原始样本字典

    Returns:
        Dict: JSON 可序列化的样本字典
    """
    return {
        'normal_time_series': sample['normal_time_series'].tolist(),
        'time_series': sample['time_series'].tolist(),
        'labels': sample['labels'].tolist(),
        'attribute': convert_numpy_types(sample['attribute'])
    }


# ============================================================================
# 第六部分：API 路由定义
# ============================================================================

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """
    根路由：返回前端页面

    使用 Jinja2Templates 渲染 index.html 模板
    request 对象包含请求信息，模板中可能需要使用
    """
    return templates.TemplateResponse(request, "index.html")


@app.get("/api/status")
async def get_status():
    """
    获取数据加载状态

    返回：
    - loaded: 数据是否已加载
    - loading: 是否正在加载
    - error: 错误信息（如果有）
    - sample_count: 样本数量（如果已加载）
    """
    return {
        "loaded": _data_cache is not None,
        "loading": _loading,
        "error": _load_error,
        "sample_count": len(_data_cache) if _data_cache is not None else 0
    }


@app.get("/api/anomaly_types")
async def get_anomaly_types():
    """
    获取所有异常类型列表

    遍历所有样本，提取并去重异常类型
    用于前端下拉框的选项
    """
    data = get_data()

    # 使用集合去重
    all_types = set()

    for sample in data:
        anomalies = sample['attribute'].get('anomalies', {})
        types = extract_anomaly_types(anomalies)
        all_types.update(types)

    # 转换为排序后的列表
    return {"anomaly_types": sorted(list(all_types))}


@app.get("/api/samples")
async def get_samples(
    anomaly_type: str = Query(..., description="异常类型"),
    limit: int = Query(10, ge=1, le=100, description="返回样本数量"),
    page: int = Query(1, ge=1, description="当前页码")
):
    """
    按异常类型筛选样本

    参数：
    - anomaly_type: 异常类型（如 'outlier', 'upward spike' 等）
    - limit: 返回的样本数量，默认 10，范围 1-100
    - page: 当前页码，默认 1，最小值 1

    返回：
    - samples: 符合条件的样本列表
    - total: 符合条件的样本总数
    - page: 当前页码
    """
    data = get_data()

    # 筛选包含指定异常类型的样本
    matched_samples = []

    for sample in data:
        anomalies = sample['attribute'].get('anomalies', {})
        types = extract_anomaly_types(anomalies)

        # 检查是否包含目标异常类型
        if anomaly_type in types:
            # 转换为 JSON 可序列化格式
            matched_samples.append(convert_sample_to_json(sample))

    # 计算分页索引
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit

    # 返回指定页的样本
    return {
        "samples": matched_samples[start_idx:end_idx],
        "total": len(matched_samples),
        "returned": min(limit, max(0, len(matched_samples) - start_idx)),
        "page": page
    }


# ============================================================================
# 第七部分：命令行参数解析和启动入口
# ============================================================================

def parse_args():
    """
    解析命令行参数

    参数：
    --data-path: 数据文件路径（必需）
    --host: 服务器主机地址，默认 127.0.0.1
    --port: 服务器端口，默认 8000
    """
    parser = argparse.ArgumentParser(
        description="时间序列异常检测可视化服务"
    )
    parser.add_argument(
        "--data-path",
        type=str,
        required=True,
        help="数据文件路径 (.pkl 文件)"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="服务器主机地址 (默认: 127.0.0.1)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="服务器端口 (默认: 8000)"
    )
    return parser.parse_args()


if __name__ == "__main__":
    import uvicorn

    # 解析命令行参数
    args = parse_args()

    # 设置全局数据路径
    _data_path = Path(args.data_path)

    # 验证数据文件是否存在
    if not _data_path.exists():
        print(f"错误：数据文件不存在: {_data_path}")
        exit(1)

    print(f"数据文件路径: {_data_path}")
    print(f"启动服务器: http://{args.host}:{args.port}")

    # 启动 FastAPI 服务
    uvicorn.run(app, host=args.host, port=args.port)
