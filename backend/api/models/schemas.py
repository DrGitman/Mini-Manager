"""Pydantic v2 schemas for Mini Manager API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


# ─── Auth ─────────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    name: str
    plan: str


# ─── Files / Classification ───────────────────────────────────────────────────

class FileItem(BaseModel):
    """A single file sent by the frontend for classification."""
    id: str
    name: str
    extension: str
    size: int = Field(default=0, ge=0, description="Size in bytes")
    modified_at: int = Field(default=0, description="Unix timestamp ms")
    relative_path: str = Field(default="", description="Path relative to scanned root, e.g. stuff/subfolder/file.txt")
    content_preview: str = Field(default="", max_length=2000, description="First ~400 chars of text content for text files")


class ClassifyRequest(BaseModel):
    files: list[FileItem] = Field(min_length=1, max_length=500)
    existing_folders: list[str] = Field(default_factory=list, description="Existing folder paths in the scanned directory")
    root_folder_name: str = Field(default="", description="Name of the root folder being scanned")


class ClassificationResult(BaseModel):
    id: str
    category: str
    new_name: str
    target_folder: str
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str
    source: Literal["cache", "heuristic", "ai"]
    sensitivity: Literal["none", "personal", "financial", "identity"] = "none"


class FolderSuggestion(BaseModel):
    original_path: str
    suggested_name: str    # new name for the final path segment only
    suggested_path: str    # full new path (parent segments unchanged)
    reason: str
    confidence: float = Field(ge=0.0, le=1.0)


class ClassifyResponse(BaseModel):
    results: list[ClassificationResult]
    folder_suggestions: list[FolderSuggestion] = []
    tokens_used: int = 0
    cache_hits: int = 0
    heuristic_hits: int = 0
    ai_calls: int = 0


# ─── Explain ──────────────────────────────────────────────────────────────────

class ExplainRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=500)
    extension: str
    size: int = Field(ge=0)
    content_preview: Optional[str] = Field(
        default=None,
        max_length=2000,
        description="Optional first ~2000 chars of file content for richer explanation",
    )


class ExplainResponse(BaseModel):
    summary: str
    suggested_category: str
    suggested_name: str
    suggested_folder: str
    confidence: float
    tokens_used: int = 0


# ─── Scans ────────────────────────────────────────────────────────────────────

class ScanCreate(BaseModel):
    folder_path: str = Field(min_length=1, max_length=1000)
    file_count: int = Field(ge=0)
    proposals: list[dict[str, Any]] = Field(default_factory=list)


class ScanRecord(BaseModel):
    id: str
    user_id: str
    folder_path: str
    file_count: int
    proposals: list[dict[str, Any]]
    created_at: datetime


class ScansResponse(BaseModel):
    scans: list[ScanRecord]
    total: int


# ─── Token tracking (internal) ────────────────────────────────────────────────

class TokenUsage(BaseModel):
    tokens_in: int = 0
    tokens_out: int = 0
    model: str = "gemini-2.0-flash"

    @property
    def total(self) -> int:
        return self.tokens_in + self.tokens_out

    @property
    def cost_usd(self) -> float:
        """
        Gemini 1.5 Flash pricing (as of mid-2025):
        Input:  $0.075 / 1M tokens (<=128k ctx)
        Output: $0.30  / 1M tokens
        """
        return (self.tokens_in * 0.075 + self.tokens_out * 0.30) / 1_000_000


# ─── Error responses ─────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    detail: str
