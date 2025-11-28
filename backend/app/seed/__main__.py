"""
CLI entrypoint for running the seed script.

Usage:
    python -m app.seed
    python -m app.seed --force
"""

import sys
import argparse
from pathlib import Path

# Add backend directory to path
backend_path = Path(__file__).parent.parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from app.core.db import SessionLocal
from app.seed.seed_data import run_seed


def main():
    """Main entrypoint for seed script."""
    parser = argparse.ArgumentParser(description="Seed MAX database with synthetic data")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force seeding even if sectors already exist"
    )
    
    args = parser.parse_args()
    
    # Create database session
    db = SessionLocal()
    
    try:
        run_seed(db, force=args.force)
    except Exception as e:
        print(f"Error during seeding: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

