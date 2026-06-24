"""Application logging configuration.

Heavy/structured logging (token counts, prompt versions, latency) is wired in
later AI slices; this provides a single place to configure logging at startup.
"""

import logging


def configure_logging() -> None:
    """Configure root logging once, at application startup."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
