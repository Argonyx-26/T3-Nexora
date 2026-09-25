"""WebSocket /ws/live: a snapshot on connect, then every tick, alert and control change."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..services.hub import hub
from ..sim.simulator import sim

router = APIRouter()


@router.websocket("/ws/live")
async def live(ws: WebSocket):
    await hub.connect(ws)
    try:
        await hub.send(ws, await asyncio.to_thread(sim.snapshot))
        while True:
            text = await ws.receive_text()  # clients may ping; anything else is ignored
            if text == "ping":
                await ws.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hub.disconnect(ws)
