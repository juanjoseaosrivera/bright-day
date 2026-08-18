"""FastAPI application factory.

Builds the app, wires middleware, global exception handlers, and routers.
Domain routers are registered in `register_routers` as their slices land.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.lifespan import lifespan
from app.core.logging import configure_logging
from app.domains.auth.router import router as auth_router
from app.domains.diary.router import router as diary_router
from app.domains.insights.router import router as insights_router
from app.domains.mood.router import router as mood_router
from app.domains.sessions.router import router as sessions_router
from app.domains.subscription.router import router as subscription_router


def register_routers(app: FastAPI) -> None:
    """Register API routers under the versioned prefix.

    Domain routers (`auth`, `subscription`, ...) are added here per slice.
    """
    settings = get_settings()

    @app.get(f"{settings.api_v1_prefix}/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(
        auth_router,
        prefix=f"{settings.api_v1_prefix}/auth",
        tags=["auth"],
    )
    app.include_router(
        subscription_router,
        prefix=f"{settings.api_v1_prefix}/subscriptions",
        tags=["subscriptions"],
    )
    app.include_router(
        sessions_router,
        prefix=f"{settings.api_v1_prefix}/sessions",
        tags=["sessions"],
    )
    app.include_router(
        diary_router,
        prefix=f"{settings.api_v1_prefix}/diary",
        tags=["diary"],
    )
    app.include_router(
        insights_router,
        prefix=f"{settings.api_v1_prefix}/insights",
        tags=["insights"],
    )
    app.include_router(
        mood_router,
        prefix=f"{settings.api_v1_prefix}/mood",
        tags=["mood"],
    )


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    configure_logging()
    settings = get_settings()

    # Interactive docs are exposed only in development.
    docs_enabled = settings.is_development

    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    # Explicit CORS origins — never a wildcard.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    register_routers(app)
    return app


app = create_app()
