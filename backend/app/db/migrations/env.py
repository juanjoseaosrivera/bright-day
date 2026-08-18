"""Alembic migration environment.

The database URL is read from application settings rather than hardcoded in
alembic.ini. `target_metadata` points at the shared declarative `Base`; domain
model modules are imported for their side effect of registering tables on that
metadata so autogenerate can diff them.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import get_settings
from app.db.session import Base
from app.domains.auth import models as auth_models  # noqa: F401  (registers tables)
from app.domains.subscription import models as subscription_models  # noqa: F401  (registers tables)
from app.domains.sessions import models as session_models  # noqa: F401  (registers tables)
from app.domains.diary import models as diary_models  # noqa: F401  (registers tables)
from app.domains.insights import models as insights_models  # noqa: F401  (registers tables)
from app.domains.mood import models as mood_models  # noqa: F401  (registers tables)

# Alembic Config object — provides access to alembic.ini values.
config = context.config

# Read the database URL straight from application settings. It is intentionally
# NOT pushed into the INI via set_main_option: ConfigParser would treat the
# password's percent-encoded characters (e.g. `%23`) as interpolation syntax.
settings = get_settings()

# Configure Python logging from the config file.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata for 'autogenerate' support and offline rendering.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a DBAPI connection)."""
    url = settings.database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (against a live connection)."""
    connectable = create_engine(settings.database_url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
