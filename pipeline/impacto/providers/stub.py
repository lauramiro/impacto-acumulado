from __future__ import annotations


class StubProvider:
    name = "stub"

    def __init__(self, responses: list[dict]) -> None:
        self._responses = list(responses)
        self.calls: list[tuple[str, str]] = []

    def complete_json(self, system: str, user: str) -> dict:
        self.calls.append((system, user))
        if not self._responses:
            raise RuntimeError("StubProvider has no responses left")
        return self._responses.pop(0)
