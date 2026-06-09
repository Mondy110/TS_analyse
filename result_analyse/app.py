#!/usr/bin/env python3
"""异常检测分析看板 - FastAPI 后端"""

import argparse
import os
import re
import pickle
from pathlib import Path
from typing import Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn

app = FastAPI(title="异常检测分析看板")

# 全局变量存储数据目录路径
DATA_DIR_1: Path = None
DATA_DIR_2: Path = None
DATASETS: Dict[str, List[str]] = {}  # {dataset_name: [sample_ids]}


def parse_filename(filename: str) -> tuple:
    """
    解析文件名，提取数据集和样本ID

    格式: {序号}_{数据集}_id_{样本号}_{类别}_tr_{长度}_1st_{编号}_results.pkl
    返回: (dataset, sample_id) 或 None
    """
    match = re.match(r'(\d+)_([A-Za-z]+)_(id_\d+)', filename)
    if match:
        dataset = match.group(2)
        sample_id = match.group(3)
        return dataset, sample_id
    return None


def scan_single_directory(data_dir: Path, label: str) -> Dict[str, List[str]]:
    """扫描单个数据目录"""
    datasets = {}

    if not data_dir.exists():
        raise FileNotFoundError(f"{label}不存在: {data_dir}")

    pkl_files = list(data_dir.glob("*_results.pkl"))
    print(f"{label}扫描到 {len(pkl_files)} 个 pkl 文件")

    for pkl_file in pkl_files:
        result = parse_filename(pkl_file.name)
        if result:
            dataset, sample_id = result
            if dataset not in datasets:
                datasets[dataset] = []
            datasets[dataset].append(sample_id)
        else:
            print(f"警告: 无法解析文件名: {pkl_file.name}")

    return datasets


def scan_dual_directories(dir1: Path, dir2: Path) -> Dict[str, List[str]]:
    """扫描两个目录，返回数据集交集"""
    datasets1 = scan_single_directory(dir1, "目录1")
    datasets2 = scan_single_directory(dir2, "目录2")

    # 计算交集：只保留两个目录都存在的数据集和样本
    common_datasets = {}
    for dataset in datasets1:
        if dataset in datasets2:
            # 取两个目录中样本的交集
            samples1 = set(datasets1[dataset])
            samples2 = set(datasets2[dataset])
            common_samples = sorted(samples1 & samples2, key=lambda x: x.lower())
            if common_samples:
                common_datasets[dataset] = common_samples

    print("\n数据集交集统计:")
    for ds, samples in sorted(common_datasets.items()):
        print(f"  {ds}: {len(samples)} 个样本")

    return common_datasets


@app.get("/")
async def index():
    """返回前端页面"""
    return FileResponse("static/index.html")


@app.get("/api/datasets")
async def get_datasets():
    """获取数据集列表及样本"""
    return DATASETS


@app.get("/api/data/{dir_index}/{dataset}/{sample_id}")
async def get_sample_data(dir_index: int, dataset: str, sample_id: str):
    """获取样本数据

    Args:
        dir_index: 目录索引 (0=目录1, 1=目录2)
        dataset: 数据集名称
        sample_id: 样本ID
    """
    if dir_index not in [0, 1]:
        raise HTTPException(status_code=400, detail="dir_index 必须是 0 或 1")

    if dataset not in DATASETS:
        raise HTTPException(status_code=404, detail=f"数据集不存在: {dataset}")

    if sample_id not in DATASETS[dataset]:
        raise HTTPException(status_code=404, detail=f"样本不存在: {sample_id}")

    # 根据索引选择目录
    data_dir = DATA_DIR_1 if dir_index == 0 else DATA_DIR_2

    # 查找对应的 pkl 文件
    pattern = f"*_{dataset}_{sample_id}_*_results.pkl"
    matching_files = list(data_dir.glob(pattern))

    if not matching_files:
        raise HTTPException(status_code=404, detail=f"找不到数据文件: {pattern}")

    pkl_file = matching_files[0]

    try:
        with open(pkl_file, 'rb') as f:
            df = pickle.load(f)

        return {
            "value": df["value"].tolist(),
            "label": df["label"].tolist(),
            "anomaly_score": df["anomaly_score"].tolist()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取数据失败: {str(e)}")


# 挂载静态文件目录
app.mount("/static", StaticFiles(directory="static"), name="static")


def main():
    global DATA_DIR_1, DATA_DIR_2, DATASETS

    parser = argparse.ArgumentParser(description="异常检测分析看板")
    parser.add_argument("--dir1", type=str, required=True,
                        help="第一个数据目录路径")
    parser.add_argument("--dir2", type=str, required=True,
                        help="第二个数据目录路径")
    parser.add_argument("--port", type=int, default=8000,
                        help="服务器端口 (默认: 8000)")
    args = parser.parse_args()

    DATA_DIR_1 = Path(args.dir1)
    DATA_DIR_2 = Path(args.dir2)
    print(f"目录1: {DATA_DIR_1}")
    print(f"目录2: {DATA_DIR_2}")

    # 扫描两个目录并计算交集
    DATASETS = scan_dual_directories(DATA_DIR_1, DATA_DIR_2)

    print(f"\n服务启动: http://localhost:{args.port}")
    uvicorn.run(app, host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
