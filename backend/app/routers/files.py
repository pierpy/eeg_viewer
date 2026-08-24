from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import MAX_UPLOAD_BYTES
from app.edf_store import EdfNotFoundError, store
from app.schemas import FileInfo

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("", response_model=FileInfo)
async def upload_file(file: UploadFile = File(...)) -> FileInfo:
    if not file.filename or not file.filename.lower().endswith(".edf"):
        raise HTTPException(status_code=400, detail="Only .edf files are supported")

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large")

    try:
        return store.save_upload(file.filename, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{file_id}", response_model=FileInfo)
async def get_file_info(file_id: str) -> FileInfo:
    try:
        return store.get_info(file_id)
    except EdfNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")


@router.delete("/{file_id}", status_code=204)
async def delete_file(file_id: str) -> None:
    store.delete(file_id)
