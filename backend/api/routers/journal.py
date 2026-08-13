"""
POST /batches              — create a new batch + its file ops
GET  /batches              — list batches (history)
POST /batches/{id}/undo    — append inverse ops (partial-undo aware)
GET  /archive              — archived files (derived from journal)
POST /archive/{op_id}/restore — restore one archived file
"""

from __future__ import annotations

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Response
from pydantic import BaseModel

from ..middleware.auth import get_current_user
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["journal"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class FileOpIn(BaseModel):
    file_name: str
    from_location: str
    to_location: str
    op_type: str = "move"


class BatchCreate(BaseModel):
    label: str
    folder_path: str = ""
    ops: List[FileOpIn]


class FileOpOut(BaseModel):
    id: str
    file_name: str
    from_location: str
    to_location: str
    op_type: str
    skipped: bool
    created_at: str


class BatchOut(BaseModel):
    id: str
    label: str
    folder_path: str
    op_count: int
    status: str
    created_at: str
    ops: Optional[List[FileOpOut]] = None


class UndoResult(BaseModel):
    batch_id: str
    undo_batch_id: str
    reversed: int
    skipped: int
    status: str   # 'undone' | 'partial'


class ArchivedFileOut(BaseModel):
    op_id: str
    file_name: str
    original_path: str
    archive_path: str
    archived_at: str


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/batches", response_model=BatchOut, status_code=201)
async def create_batch(
    body: BatchCreate,
    user: dict = Depends(get_current_user),
) -> BatchOut:
    user_id: str = user["sub"]
    pool = get_pool()
    batch_id = str(uuid.uuid4())

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO batches (id, user_id, label, folder_path, op_count, status)
                VALUES ($1, $2, $3, $4, $5, 'applied')
                """,
                batch_id, user_id, body.label, body.folder_path, len(body.ops),
            )
            if body.ops:
                await conn.executemany(
                    """
                    INSERT INTO file_ops (user_id, batch_id, file_name, from_location, to_location, op_type)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    [
                        (user_id, batch_id, op.file_name, op.from_location, op.to_location, op.op_type)
                        for op in body.ops
                    ],
                )

    return BatchOut(
        id=batch_id,
        label=body.label,
        folder_path=body.folder_path,
        op_count=len(body.ops),
        status="applied",
        created_at="",
    )


@router.get("/batches", response_model=List[BatchOut])
async def list_batches(
    user: dict = Depends(get_current_user),
) -> List[BatchOut]:
    user_id: str = user["sub"]
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT id, label, folder_path, op_count, status, created_at
        FROM   batches
        WHERE  user_id = $1
        ORDER  BY created_at DESC
        LIMIT  50
        """,
        user_id,
    )
    return [
        BatchOut(
            id=str(r["id"]),
            label=r["label"],
            folder_path=r["folder_path"],
            op_count=r["op_count"],
            status=r["status"],
            created_at=r["created_at"].isoformat(),
        )
        for r in rows
    ]


@router.post("/batches/{batch_id}/undo", response_model=UndoResult)
async def undo_batch(
    batch_id: str = Path(...),
    user: dict = Depends(get_current_user),
) -> UndoResult:
    """
    Append-only undo: for each op in the batch, create an inverse op.
    Skips files that have already moved from their expected location.
    Returns a summary of how many were reversed vs skipped.
    """
    user_id: str = user["sub"]
    pool = get_pool()

    # Verify batch belongs to this user
    batch_row = await pool.fetchrow(
        "SELECT id, status, op_count FROM batches WHERE id = $1 AND user_id = $2",
        batch_id, user_id,
    )
    if not batch_row:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Get all forward ops from the original batch
    op_rows = await pool.fetch(
        """
        SELECT id, file_name, from_location, to_location, op_type
        FROM   file_ops
        WHERE  batch_id = $1 AND op_type != 'undo'
        ORDER  BY created_at
        """,
        batch_id,
    )
    if not op_rows:
        raise HTTPException(status_code=400, detail="No reversible ops in this batch")

    undo_batch_id = str(uuid.uuid4())
    reversed_count = 0
    skipped_count = 0

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Create the undo batch
            await conn.execute(
                """
                INSERT INTO batches (id, user_id, label, folder_path, op_count, status)
                VALUES ($1, $2, $3, '', 0, 'applied')
                """,
                undo_batch_id, user_id, f"Undo: {batch_row['id'][:8]}",
            )

            for op in op_rows:
                # NOTE: In a real system you'd check the filesystem here.
                # Since we don't have filesystem access, we check the journal:
                # A file is "still moved" if its last op put it at to_location.
                latest = await conn.fetchrow(
                    """
                    SELECT to_location FROM file_ops
                    WHERE  user_id = $1 AND file_name = $2
                    ORDER  BY created_at DESC
                    LIMIT  1
                    """,
                    user_id, op["file_name"],
                )
                already_moved = latest and latest["to_location"] != op["to_location"]
                skipped = bool(already_moved)

                await conn.execute(
                    """
                    INSERT INTO file_ops (user_id, batch_id, file_name, from_location, to_location, op_type, skipped)
                    VALUES ($1, $2, $3, $4, $5, 'undo', $6)
                    """,
                    user_id, undo_batch_id,
                    op["file_name"],
                    op["to_location"],    # undo goes back the other way
                    op["from_location"],
                    skipped,
                )

                if skipped:
                    skipped_count += 1
                else:
                    reversed_count += 1

            # Update op_count on undo batch
            await conn.execute(
                "UPDATE batches SET op_count = $1 WHERE id = $2",
                len(op_rows), undo_batch_id,
            )

            # Update original batch status
            new_status = "undone" if skipped_count == 0 else "partial"
            await conn.execute(
                "UPDATE batches SET status = $1 WHERE id = $2",
                new_status, batch_id,
            )

    return UndoResult(
        batch_id=batch_id,
        undo_batch_id=undo_batch_id,
        reversed=reversed_count,
        skipped=skipped_count,
        status="undone" if skipped_count == 0 else "partial",
    )


@router.get("/archive", response_model=List[ArchivedFileOut])
async def get_archive(
    user: dict = Depends(get_current_user),
) -> List[ArchivedFileOut]:
    """Return files currently in archive (derived from journal)."""
    user_id: str = user["sub"]
    pool = get_pool()

    rows = await pool.fetch(
        """
        SELECT DISTINCT ON (file_name)
            id            AS op_id,
            file_name,
            from_location AS original_path,
            to_location   AS archive_path,
            created_at    AS archived_at
        FROM   file_ops
        WHERE  user_id  = $1
          AND  (to_location LIKE '%archive%' OR to_location LIKE '%quarantine%' OR op_type = 'archive')
        ORDER  BY file_name, created_at DESC
        LIMIT  100
        """,
        user_id,
    )

    return [
        ArchivedFileOut(
            op_id=str(r["op_id"]),
            file_name=r["file_name"],
            original_path=r["original_path"],
            archive_path=r["archive_path"],
            archived_at=r["archived_at"].isoformat(),
        )
        for r in rows
    ]


@router.get("/batches/{batch_id}/ops", response_model=List[FileOpOut])
async def get_batch_ops(
    batch_id: str = Path(...),
    user: dict = Depends(get_current_user),
) -> List[FileOpOut]:
    """Return all file ops for a given batch."""
    user_id: str = user["sub"]
    pool = get_pool()

    batch = await pool.fetchrow(
        "SELECT id FROM batches WHERE id = $1 AND user_id = $2",
        batch_id, user_id,
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    rows = await pool.fetch(
        """
        SELECT id, file_name, from_location, to_location, op_type, skipped, created_at
        FROM   file_ops
        WHERE  batch_id = $1
        ORDER  BY created_at
        """,
        batch_id,
    )
    return [
        FileOpOut(
            id=str(r["id"]),
            file_name=r["file_name"],
            from_location=r["from_location"],
            to_location=r["to_location"],
            op_type=r["op_type"],
            skipped=r["skipped"],
            created_at=r["created_at"].isoformat(),
        )
        for r in rows
    ]


@router.post("/file_ops/{op_id}/undo", response_model=dict)
async def undo_single_op(
    op_id: str = Path(...),
    user: dict = Depends(get_current_user),
) -> dict:
    """Append one inverse op for a single file operation."""
    user_id: str = user["sub"]
    pool = get_pool()

    op_row = await pool.fetchrow(
        "SELECT file_name, from_location, to_location FROM file_ops WHERE id = $1 AND user_id = $2",
        op_id, user_id,
    )
    if not op_row:
        raise HTTPException(status_code=404, detail="Op not found")

    undo_batch_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO batches (id, user_id, label, folder_path, op_count, status)
                VALUES ($1, $2, $3, '', 1, 'applied')
                """,
                undo_batch_id, user_id, f"Undo op: {op_row['file_name']}",
            )
            await conn.execute(
                """
                INSERT INTO file_ops (user_id, batch_id, file_name, from_location, to_location, op_type)
                VALUES ($1, $2, $3, $4, $5, 'undo')
                """,
                user_id, undo_batch_id,
                op_row["file_name"],
                op_row["to_location"],
                op_row["from_location"],
            )

    return {"ok": True, "undo_batch_id": undo_batch_id}


@router.delete("/archive/{op_id}", status_code=204, response_model=None)
async def delete_archived_file(
    op_id: str = Path(...),
    user: dict = Depends(get_current_user),
) -> Response:
    """Permanently remove an archived file record from the journal."""
    user_id: str = user["sub"]
    pool = get_pool()

    result = await pool.execute(
        "DELETE FROM file_ops WHERE id = $1 AND user_id = $2",
        op_id, user_id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Op not found")
    return Response(status_code=204)


@router.post("/archive/{op_id}/restore", response_model=dict)
async def restore_archived_file(
    op_id: str = Path(...),
    user: dict = Depends(get_current_user),
) -> dict:
    """Restore one archived file: append a 'restore' op back to original location."""
    user_id: str = user["sub"]
    pool = get_pool()

    op_row = await pool.fetchrow(
        "SELECT file_name, from_location, to_location FROM file_ops WHERE id = $1 AND user_id = $2",
        op_id, user_id,
    )
    if not op_row:
        raise HTTPException(status_code=404, detail="Op not found")

    # Create a one-op restore batch
    restore_batch_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO batches (id, user_id, label, folder_path, op_count, status)
                VALUES ($1, $2, 'Restore: ' || $3, '', 1, 'applied')
                """,
                restore_batch_id, user_id, op_row["file_name"],
            )
            await conn.execute(
                """
                INSERT INTO file_ops (user_id, batch_id, file_name, from_location, to_location, op_type)
                VALUES ($1, $2, $3, $4, $5, 'restore')
                """,
                user_id, restore_batch_id,
                op_row["file_name"],
                op_row["to_location"],   # currently in archive
                op_row["from_location"], # restore to original
            )

    return {"ok": True, "restore_batch_id": restore_batch_id}
