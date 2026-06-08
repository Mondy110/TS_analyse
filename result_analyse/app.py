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
DATA_DIR: Path = None
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


def scan_data_directory(data_dir: Path) -> Dict[str, List[str]]:
    """扫描数据目录，返回数据集-样本映射"""
    datasets = {}

    if not data_dir.exists():
        raise FileNotFoundError(f"数据目录不存在: {data_dir}")

    pkl_files = list(data_dir.glob("*_results.pkl"))
    print(f"扫描到 {len(pkl_files)} 个 pkl 文件")

    for pkl_file in pkl_files:
        result = parse_filename(pkl_file.name)
        if result:
            dataset, sample_id = result
            if dataset not in datasets:
                datasets[dataset] = []
            datasets[dataset].append(sample_id)
        else:
            print(f"警告: 无法解析文件名: {pkl_file.name}")

    # 打印统计信息
    print("\n数据集统计:")
    for ds, samples in sorted(datasets.items()):
        print(f"  {ds}: {len(samples)} 个样本")

    return datasets


@app.get("/")
async def index():
    """返回前端页面"""
    return FileResponse("static/index.html")


@app.get("/api/datasets")
async def get_datasets():
    """获取数据集列表及样本"""
    return DATASETS


@app.get("/api/data/{dataset}/{sample_id}")
async def get_sample_data(dataset: str, sample_id: str):
    """获取样本数据"""
    if dataset not in DATASETS:
        raise HTTPException(status_code=404, detail=f"数据集不存在: {dataset}")

    if sample_id not in DATASETS[dataset]:
        raise HTTPException(status_code=404, detail=f"样本不存在: {sample_id}")

    # 查找对应的 pkl 文件
    pattern = f"*_{dataset}_{sample_id}_*_results.pkl"
    matching_files = list(DATA_DIR.glob(pattern))

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
    global DATA_DIR, DATASETS

    parser = argparse.ArgumentParser(description="异常检测分析看板")
    parser.add_argument("--data-dir", type=str, default="./output/VETime",
                        help="数据目录路径 (默认: ./output/VETime)")
    parser.add_argument("--port", type=int, default=8000,
                        help="服务器端口 (默认: 8000)")
    args = parser.parse_args()

    DATA_DIR = Path(args.data_dir)
    print(f"数据目录: {DATA_DIR}")

    # 扫描数据目录
    DATASETS = scan_data_directory(DATA_DIR)

    print(f"\n服务启动: http://localhost:{args.port}")
    uvicorn.run(app, host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
