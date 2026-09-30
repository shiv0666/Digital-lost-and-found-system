"""Small additive migration for installations created before item privacy existed."""
from sqlalchemy import inspect, text

def migrate_private_items(engine):
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "items" not in inspector.get_table_names():
            return
        columns = {column["name"] for column in inspector.get_columns("items")}
        if "visibility" not in columns:
            connection.execute(text("ALTER TABLE items ADD COLUMN visibility VARCHAR(7) NOT NULL DEFAULT 'PUBLIC'"))
        if "verification_details" not in columns:
            connection.execute(text("ALTER TABLE items ADD COLUMN verification_details TEXT NOT NULL DEFAULT ''"))
        if connection.dialect.name == "postgresql":
            checks = {check["name"] for check in inspect(connection).get_check_constraints("items")}
            if "ck_items_visibility" not in checks:
                connection.execute(text("ALTER TABLE items ADD CONSTRAINT ck_items_visibility CHECK (visibility IN ('PUBLIC','PRIVATE'))"))
