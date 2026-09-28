"""
alembic/env.py — Alembic environment for async SQLAlchemy.

Loads DATABASE_URL from .env via pydantic-settings so credentials
never live in alembic.ini. Supports async engine via run_async_migrations().
"""
from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

# Load app config (reads .env)
from app.core.config import get_settings
# Import Base so Alembic sees all ORM models for autogenerate
from app.db.database import Base
import app.db.models  # noqa: F401 — registers all models with Base.metadata

config = context.config
settings = get_settings()

# Override the sqlalchemy.url in alembic.ini with the value from .env
# configparser interprets % as interpolation markers — escape them
_db_url_for_config = settings.database_url.replace("%", "%%")
config.set_main_option("sqlalchemy.url", _db_url_for_config)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (generates SQL without a live connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations."""
    import ssl
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE
    connectable = create_async_engine(
        settings.database_url,
        poolclass=pool.NullPool,
        connect_args={"ssl": ssl_ctx},
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode using asyncio."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
