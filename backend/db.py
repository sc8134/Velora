from sqlalchemy import Column, Integer, String, create_engine, MetaData, Table

engine = create_engine("postgresql://user:pass@localhost/velora")
metadata = MetaData()

videos = Table("videos", metadata,
    Column("id", Integer, primary_key=True),
    Column("title", String),
    Column("url", String),
    Column("duration", Integer),
    Column("uploader", String),
)

metadata.create_all(engine)
