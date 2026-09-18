from __future__ import annotations

from typing import Protocol


class Provider(Protocol):
    name: str

    def complete_json(self, system: str, user: str) -> dict: ...
