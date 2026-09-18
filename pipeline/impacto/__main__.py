from __future__ import annotations

import argparse
import importlib
import sys

COMMANDS = {
    "migrate": "impacto.db.migrate",
    "fetch": "impacto.fetch.run",
    "extract": "impacto.extract.run",
    "resolve": "impacto.resolve.run",
    "aggregate": "impacto.aggregate.run",
    "export": "impacto.aggregate.export",
    "reference": "impacto.reference.load",
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="impacto")
    parser.add_argument("command", choices=sorted(COMMANDS))
    parser.add_argument("rest", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    module = importlib.import_module(COMMANDS[args.command])
    return int(module.main(args.rest) or 0)


if __name__ == "__main__":
    sys.exit(main())
