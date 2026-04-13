"""Room CRUD — add, update, remove rooms from config."""

import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from .config import _read_modify_write

router = APIRouter(tags=["rooms"])


VALID_EMITTER_TYPES = {"radiator", "ufh", "fan_coil"}


class RoomConfig(BaseModel):
    area_m2: float
    facing: str = "interior"
    ceiling_m: float = 2.4
    emitter_kw: Optional[float] = None
    emitter_type: Optional[str] = None  # "radiator" | "ufh" | "fan_coil"
    trv_entity: Optional[str] = None
    independent_sensor: Optional[str] = None
    heating_entity: Optional[str] = None
    control_mode: Optional[str] = None  # indirect | direct | none
    valve_hardware: Optional[str] = None
    valve_scale: Optional[int] = None  # 100 (0-100%) or 255 (0-255)


def _signal_restart():
    try:
        with open("/config/qsh_restart_requested", "w") as f:
            f.write("1")
    except OSError:
        pass


@router.post("/rooms/{room_name}")
def add_room(room_name: str, room: RoomConfig):
    """Add a new room to qsh.yaml."""
    if room.emitter_type is not None and room.emitter_type not in VALID_EMITTER_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid emitter_type '{room.emitter_type}'. Valid: {sorted(VALID_EMITTER_TYPES)}")

    room_data = room.dict(exclude_none=True)

    def transform(raw: dict) -> dict:
        rooms = raw.setdefault("rooms", {})
        if room_name in rooms:
            raise ValueError(f"Room '{room_name}' already exists")
        rooms[room_name] = room_data
        return raw

    try:
        _read_modify_write(transform)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    _signal_restart()
    return {"created": room_name, "restart_required": True}


@router.put("/rooms/{room_name}")
def update_room(room_name: str, room: RoomConfig):
    """Update an existing room config."""
    if room.emitter_type is not None and room.emitter_type not in VALID_EMITTER_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid emitter_type '{room.emitter_type}'. Valid: {sorted(VALID_EMITTER_TYPES)}")

    room_data = room.dict(exclude_none=True)

    def transform(raw: dict) -> dict:
        rooms = raw.get("rooms", {})
        if room_name not in rooms:
            raise KeyError(f"Room '{room_name}' not found")
        rooms[room_name] = room_data
        return raw

    try:
        _read_modify_write(transform)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e).strip("'\""))

    _signal_restart()
    return {"updated": room_name, "restart_required": True}


@router.delete("/rooms/{room_name}")
def delete_room(room_name: str):
    """Remove a room from config."""
    def transform(raw: dict) -> dict:
        rooms = raw.get("rooms", {})
        if room_name not in rooms:
            raise KeyError(f"Room '{room_name}' not found")
        del rooms[room_name]
        return raw

    try:
        _read_modify_write(transform)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e).strip("'\""))

    _signal_restart()
    return {"deleted": room_name, "restart_required": True}
