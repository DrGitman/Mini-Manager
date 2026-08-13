"""GET /search — fuzzy file and folder search across scan history."""

from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import List

from ..middleware.auth import get_current_user
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["search"])


class SearchFile(BaseModel):
    name: str
    suggested_name: str
    category: str
    target_folder: str
    size_bytes: int


class SearchFolder(BaseModel):
    path: str
    file_count: int


class SearchResponse(BaseModel):
    files: List[SearchFile]
    folders: List[SearchFolder]


@router.get("/search", response_model=SearchResponse)
async def search(
    q: str = Query(min_length=2, max_length=100),
    user: dict = Depends(get_current_user),
) -> SearchResponse:
    """Search across scan proposals and scanned folder paths."""
    user_id: str = user["sub"]
    pool = get_pool()
    pattern = f"%{q}%"

    # Search files within proposals JSON
    file_rows = await pool.fetch(
        """
        SELECT DISTINCT ON (coalesce(p->>'new_name', p->>'name'))
            coalesce(p->>'name', '')           AS name,
            coalesce(p->>'new_name', '')       AS suggested_name,
            coalesce(p->>'category', 'Other')  AS category,
            coalesce(p->>'target_folder', '')  AS target_folder,
            coalesce((p->>'size')::bigint, 0)  AS size_bytes
        FROM   scans s,
               jsonb_array_elements(
                   CASE WHEN jsonb_typeof(s.proposals::jsonb) = 'array'
                        THEN s.proposals::jsonb
                        ELSE '[]'::jsonb END
               ) AS p
        WHERE  s.user_id = $1
          AND  (
                p->>'name'          ILIKE $2
             OR p->>'new_name'      ILIKE $2
             OR p->>'target_folder' ILIKE $2
          )
        ORDER  BY coalesce(p->>'new_name', p->>'name')
        LIMIT  15
        """,
        user_id,
        pattern,
    )

    # Search folder paths
    folder_rows = await pool.fetch(
        """
        SELECT   folder_path AS path,
                 SUM(file_count)::int AS file_count
        FROM     scans
        WHERE    user_id    = $1
          AND    folder_path ILIKE $2
        GROUP BY folder_path
        ORDER BY folder_path
        LIMIT    5
        """,
        user_id,
        pattern,
    )

    return SearchResponse(
        files=[
            SearchFile(
                name=r["name"],
                suggested_name=r["suggested_name"],
                category=r["category"],
                target_folder=r["target_folder"],
                size_bytes=int(r["size_bytes"] or 0),
            )
            for r in file_rows
        ],
        folders=[
            SearchFolder(path=r["path"], file_count=r["file_count"])
            for r in folder_rows
        ],
    )
