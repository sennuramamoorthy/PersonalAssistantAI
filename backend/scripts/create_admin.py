"""Create an initial admin user for the application.

Usage:
    python -m scripts.create_admin --email admin@example.com --name "Chairman Name" --password yourpassword
"""
import argparse
import sys
from pathlib import Path

# Add parent dir to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import Base
from app.core.security import hash_password
from app.models.user import User


def main():
    parser = argparse.ArgumentParser(description="Create an admin user")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--name", required=True, help="Full name")
    parser.add_argument("--password", required=True, help="Password")
    args = parser.parse_args()

    engine = create_engine(settings.database_url_sync)
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        existing = session.execute(
            select(User).where(User.email == args.email)
        ).scalar_one_or_none()

        if existing:
            print(f"User with email {args.email} already exists.")
            return

        user = User(
            email=args.email,
            full_name=args.name,
            hashed_password=hash_password(args.password),
        )
        session.add(user)
        session.commit()
        print(f"Admin user created: {args.email}")


if __name__ == "__main__":
    main()
