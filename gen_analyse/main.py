"""
时间序列异常检测可视化项目 - 后端主程序

本模块提供以下功能：
1. FastAPI 应用初始化和配置
2. 静态文件和模板目录挂载
3. 数据懒加载机制
4. 多进程并行构建全局倒排索引
5. API 路由定义

作者：VETime 项目组
日期：2026-06-08
优化日期：2026-06-09 - 多进程并行 + 倒排索引架构
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
import os          # 操作系统接口，获取 CPU 核心数
from concurrent.futures import ProcessPoolExecutor  # 多进程并行计算

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

# ============================================================================
# 全局高性能倒排索引缓存变量
# ============================================================================

# 层级化的异常类型数据缓存，供 /api/anomaly_types 直接 O(1) 秒回
_hierarchical_types_cache: Optional[Dict[str, Any]] = None

# 子类名称到样本物理索引（Index 整数列表）的全局倒排索引字典
_anomaly_type_to_indices: Dict[str, List[int]] = {}

# 一级大类名称到样本物理索引的全局倒排索引字典
_category_to_indices: Dict[str, List[int]] = {}

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


# ============================================================================
# 第五部分：辅助函数
# ============================================================================

def _parse_sample_anomalies_chunk(anomalies_chunk: List[Dict[str, Any]]) -> List[List[str]]:
    """
    多进程分块解析函数 - 提取异常类型列表

    该函数位于模块顶层，确保可被 Pickle 序列化。
    只接收包含 anomalies 字典的轻量切片列表，遍历提取并返回对应的纯字符串异常类型列表。

    Args:
        anomalies_chunk: 包含多个样本 anomalies 字典的列表切片

    Returns:
        List[List[str]]: 每个样本对应的异常类型列表的列表
    """
    results = []
    for anomalies in anomalies_chunk:
        types = []
        for key in anomalies.keys():
            # 使用 split('_', 1) 只分割第一个下划线
            # '0_outlier' -> ['0', 'outlier']
            # '1_upward spike' -> ['1', 'upward spike']
            parts = key.split('_', 1)
            if len(parts) > 1:
                types.append(parts[1])
        results.append(types)
    return results


def _build_global_indices() -> None:
    """
    构建全局倒排索引 - 多进程并行优化版本

    核心优化策略：
    1. 提取轻量的 anomalies 字典数据，避免 IPC 序列化沉重的大矩阵
    2. 使用 ProcessPoolExecutor 多进程并行提取异常类型
    3. 构建子类和大类的倒排索引字典，实现 O(1) 查找
    4. 预计算并缓存层级化的异常类型数据
    """
    global _hierarchical_types_cache, _anomaly_type_to_indices, _category_to_indices

    if _data_cache is None:
        return

    total_samples = len(_data_cache)
    print(f"开始构建全局倒排索引，共 {total_samples} 个样本...")

    # ========================================================================
    # 第一步：提取轻量的 anomalies 字典数据（绝不要把包含时序大矩阵的整个 _data_cache 传进进程池）
    # ========================================================================
    print("步骤 1/4: 提取轻量 anomalies 字典数据...")
    anomalies_list = []
    for sample in _data_cache:
        anomalies = sample['attribute'].get('anomalies', {})
        anomalies_list.append(anomalies)

    # ========================================================================
    # 第二步：多进程并行提取异常类型
    # ========================================================================
    print("步骤 2/4: 多进程并行提取异常类型...")
    cpu_count = os.cpu_count() or 4
    print(f"  使用 {cpu_count} 个 CPU 核心并行处理...")

    # 计算每个进程处理的块大小
    chunk_size = max(1, total_samples // cpu_count)

    # 切分数据为多个块
    chunks = []
    for i in range(0, total_samples, chunk_size):
        chunks.append(anomalies_list[i:i + chunk_size])

    # 多进程并行处理
    all_types_per_sample = []
    with ProcessPoolExecutor(max_workers=cpu_count) as executor:
        # 并行提交所有块的处理任务
        futures = [executor.submit(_parse_sample_anomalies_chunk, chunk) for chunk in chunks]

        # 收集结果并保持顺序
        for future in futures:
            all_types_per_sample.extend(future.result())

    # ========================================================================
    # 第三步：构建倒排索引
    # ========================================================================
    print("步骤 3/4: 构建倒排索引...")

    # 重置索引字典
    _anomaly_type_to_indices = {}
    _category_to_indices = {}

    # 用于构建层级缓存
    hierarchical_sets: Dict[str, set] = {
        category: set() for category in CATEGORY_KEYWORDS.keys()
    }
    hierarchical_sets[FALLBACK_CATEGORY] = set()

    # 遍历每个样本的异常类型列表，构建倒排索引
    for sample_idx, types in enumerate(all_types_per_sample):
        for anomaly_type in types:
            # 构建子类倒排索引
            if anomaly_type not in _anomaly_type_to_indices:
                _anomaly_type_to_indices[anomaly_type] = []
            _anomaly_type_to_indices[anomaly_type].append(sample_idx)

            # 归类到一级大类
            category = _classify_anomaly_type(anomaly_type)
            hierarchical_sets[category].add(anomaly_type)

    # 对子类索引进行自然排序
    for anomaly_type in _anomaly_type_to_indices:
        _anomaly_type_to_indices[anomaly_type] = sorted(_anomaly_type_to_indices[anomaly_type])

    # ========================================================================
    # 第四步：构建大类倒排索引和层级缓存
    # ========================================================================
    print("步骤 4/4: 构建大类倒排索引和层级缓存...")

    # 获取所有大类名称
    all_categories = list(CATEGORY_KEYWORDS.keys()) + [FALLBACK_CATEGORY]

    # 大类到子类列表的映射（用于大类筛选时的 OR 展开）
    category_to_subtypes: Dict[str, List[str]] = {}

    for category in all_categories:
        subtypes = hierarchical_sets.get(category, set())
        if subtypes:
            # 排序子类列表
            category_to_subtypes[category] = sorted(list(subtypes))

            # 合并该大类下所有子类的索引
            merged_indices = set()
            for subtype in subtypes:
                if subtype in _anomaly_type_to_indices:
                    merged_indices.update(_anomaly_type_to_indices[subtype])

            # 自然排序
            _category_to_indices[category] = sorted(list(merged_indices))

    # 构建层级缓存（预格式化并排序）
    _hierarchical_types_cache = {
        category: sorted(list(subtypes))
        for category, subtypes in hierarchical_sets.items()
        if subtypes
    }

    # 打印统计信息
    print(f"全局倒排索引构建完成！")
    print(f"  - 子类数量: {len(_anomaly_type_to_indices)}")
    print(f"  - 大类数量: {len(_category_to_indices)}")
    print(f"  - 层级缓存条目: {len(_hierarchical_types_cache)}")


def _classify_anomaly_type(anomaly_type: str) -> str:
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


def get_data() -> List[Dict[str, Any]]:
    """
    懒加载数据函数

    实现按需加载策略：
    1. 首次调用时，从 pickle 文件加载数据到内存
    2. 加载完成后立即构建全局倒排索引
    3. 后续调用直接返回缓存的数据
    4. 使用加载锁防止并发加载

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

        # ====================================================================
        # 核心优化：数据加载完成后立即构建全局倒排索引
        # ====================================================================
        _build_global_indices()

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
    获取层级化的异常类型列表

    性能优化：直接返回预计算好的 _hierarchical_types_cache 缓存
    耗时：O(1)，约 0 毫秒

    返回一级大类到二级子类列表的映射字典
    用于前端两级下拉框联动
    """
    # 确保数据已加载（会触发倒排索引构建）
    get_data()

    # 直接返回预计算好的缓存
    return {"hierarchical_types": _hierarchical_types_cache}


@app.get("/api/samples")
async def get_samples(
    anomaly_type: str = Query(..., description="异常类型（大类或子类）"),
    limit: int = Query(10, ge=1, le=100, description="返回样本数量"),
    page: int = Query(1, ge=1, description="当前页码")
):
    """
    按异常类型筛选样本 - 倒排索引优化版本

    核心优化：
    1. 使用倒排索引实现 O(1) 查找匹配的样本索引
    2. 先分页切片，再进行局部延迟序列化
    3. 只对当前页的样本进行 NumPy 到 List 的转换

    参数：
    - anomaly_type: 异常类型（大类名如 'Point Anomalies (点异常)' 或子类名如 'outlier'）
    - limit: 返回的样本数量，默认 10，范围 1-100
    - page: 当前页码，默认 1，最小值 1
    """
    # 确保数据已加载（会触发倒排索引构建）
    data = get_data()

    # ========================================================================
    # O(1) 倒排索引查找
    # ========================================================================
    target_indices: List[int] = []

    # 先尝试大类查找
    if anomaly_type in _category_to_indices:
        # 大类筛选：直接获取该大类下所有样本的索引
        target_indices = _category_to_indices[anomaly_type]
    elif anomaly_type in _anomaly_type_to_indices:
        # 子类精确匹配：直接获取该子类下所有样本的索引
        target_indices = _anomaly_type_to_indices[anomaly_type]
    else:
        # 未找到匹配类型，返回空结果
        return {
            "samples": [],
            "total": 0,
            "returned": 0,
            "page": page
        }

    # ========================================================================
    # 分页切片计算
    # ========================================================================
    total = len(target_indices)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit

    # 边界检查
    if start_idx >= total:
        return {
            "samples": [],
            "total": total,
            "returned": 0,
            "page": page
        }

    # 获取当前页所需的样本索引
    page_indices = target_indices[start_idx:end_idx]

    # ========================================================================
    # 局部延迟序列化：只对当前页的样本进行转换
    # ========================================================================
    samples = []
    for idx in page_indices:
        samples.append(convert_sample_to_json(data[idx]))

    return {
        "samples": samples,
        "total": total,
        "returned": len(samples),
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
