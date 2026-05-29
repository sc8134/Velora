from sqlalchemy import Column, Integer, String, create_engine, MetaData, Table
import os

# Database URL from environment — not used by the app yet (users stored in JSON)
# Set DATABASE_URL env var to enable PostgreSQL in the future
DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    engine = create_engine(DATABASE_URL)
    metadata = MetaData()

    videos = Table("videos", metadata,
        Column("id", Integer, primary_key=True),
        Column("title", String),
        Column("url", String),
        Column("duration", Integer),
        Column("uploader", String),
    )

    metadata.create_all(engine)
