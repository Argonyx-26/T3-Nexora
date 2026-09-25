from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import event, inspect
from sqlmodel import Session, SQLModel, create_engine

from .config import settings

_is_sqlite = settings.database_url.startswith("sqlite")
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(conn, _):
        cur = conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")  # readers don't block the simulator's writes
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


def create_tables() -> None:
    from . import models  # noqa: F401  (registers the tables)

    SQLModel.metadata.create_all(engine)


def schema_is_current() -> bool:
    """False when an older database is missing a table or column the models now have."""
    from . import models  # noqa: F401

    insp = inspect(engine)
    existing = set(insp.get_table_names())
    for table in SQLModel.metadata.sorted_tables:
        if table.name not in existing:
            return False
        cols = {c["name"] for c in insp.get_columns(table.name)}
        if any(c.name not in cols for c in table.columns):
            return False
    return True


def drop_tables() -> None:
    from . import models  # noqa: F401

    SQLModel.metadata.drop_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
