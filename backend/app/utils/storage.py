"""
Storage utilities for reading JSON files.
"""
import json
import os
from pathlib import Path
from typing import List, Dict, Any


STORAGE_DIR = Path(__file__).parent.parent.parent / "storage"
SECTORS_FILE = STORAGE_DIR / "sectors.json"
AGENTS_FILE = STORAGE_DIR / "agents.json"
DISCUSSIONS_FILE = STORAGE_DIR / "discussions.json"


def ensure_storage_dir() -> None:
    """Ensure storage directory exists."""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def load_sectors() -> List[Dict[str, Any]]:
    """Load sectors from JSON file."""
    ensure_storage_dir()
    try:
        with open(SECTORS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        with open(SECTORS_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, indent=2)
        return []


def load_agents() -> List[Dict[str, Any]]:
    """Load agents from JSON file."""
    ensure_storage_dir()
    try:
        with open(AGENTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        with open(AGENTS_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, indent=2)
        return []


def load_discussions() -> List[Dict[str, Any]]:
    """Load discussions from JSON file."""
    ensure_storage_dir()
    try:
        with open(DISCUSSIONS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        with open(DISCUSSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, indent=2)
        return []
