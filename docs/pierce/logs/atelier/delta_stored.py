"""The exact change, on the exact data: the Watch's delta computed from
the *stored cells* against the same delta computed from the stored
*files*, for every adjacent version pair in the demo database.

`as_product_sees_it` in the sibling script simulates ingest by keeping
every cell the reader found. Ingest keeps only the ones it could name
and number, so this runs the real thing instead of a simulation.
"""
import asyncio, sys, time
sys.path.insert(0, "/home/user/Claidor/server")
from sqlalchemy import select
from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import ArtifactKind, Dossier
from polar.postgres import create_async_engine
from polar.tieout.repository import TieOutRepository
from polar.tieout.service import _restore_file_facts, _workbook_of, delta_between
from polar.tieout.watch import delta_of

def shape(report):
    return (
        report.new_defects, report.repaired_defects, report.persistent_defects,
        report.unmatched_old, report.unmatched_new,
        tuple(report.sheets_added), tuple(report.sheets_removed),
        tuple((i.kind, i.sheet, i.first_row, i.last_row, tuple(i.columns), i.detail)
              for i in report.items),
    )

async def main():
    engine = create_async_engine("app")
    maker = create_async_sessionmaker(engine)
    async with maker() as session:
        repo = TieOutRepository.from_session(session)
        deals = (await session.execute(select(Dossier).order_by(Dossier.name))).scalars().all()
        for deal in deals:
            artifacts = [one for one in await repo.list_artifacts(deal.id)
                         if one.kind is ArtifactKind.model]
            by_lineage: dict = {}
            for one in artifacts:
                by_lineage.setdefault(one.lineage_id, []).append(one)
            for versions in by_lineage.values():
                versions.sort(key=lambda one: one.version)
                for old, new in zip(versions, versions[1:]):
                    if not (old.storage_path and new.storage_path):
                        continue
                    t = time.monotonic()
                    try:
                        from_files = delta_between(old, new)
                    except Exception as exc:
                        print(f"  {deal.name[:28]:30} v{old.version}→v{new.version}"
                              f"  files refused ({type(exc).__name__})")
                        continue
                    files_took = time.monotonic() - t

                    t = time.monotonic()
                    books = []
                    for side in (old, new):
                        book = _workbook_of(await repo.cells_for_graph(side.id))
                        _restore_file_facts(book, side.counts)
                        books.append(book)
                    from_cells = delta_of(books[0], books[1],
                                          old_name=old.filename, new_name=new.filename)
                    cells_took = time.monotonic() - t
                    same = shape(from_files) == shape(from_cells)
                    print(f"  {deal.name[:28]:30} v{old.version}→v{new.version}"
                          f"  files {files_took:7.2f}s  cells {cells_took:7.2f}s"
                          f"  same: {'YES' if same else 'NO'}")
                    if not same:
                        print(f"      files {from_files.summary}")
                        print(f"      cells {from_cells.summary}")
    await engine.dispose()

asyncio.run(main())
