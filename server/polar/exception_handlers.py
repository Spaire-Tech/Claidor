from urllib.parse import urlencode

import structlog

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse, Response

from polar.config import settings
from polar.exceptions import (
    PolarError,
    PolarRedirectionError,
    SpaireRequestValidationError,
    ResourceNotModified,
)

log = structlog.get_logger()


async def polar_exception_handler(request: Request, exc: PolarError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": type(exc).__name__, "detail": exc.message},
        headers=exc.headers,
    )


async def request_validation_exception_handler(
    request: Request, exc: RequestValidationError | SpaireRequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": type(exc).__name__, "detail": jsonable_encoder(exc.errors())},
    )


async def polar_redirection_exception_handler(
    request: Request, exc: PolarRedirectionError
) -> RedirectResponse:
    error_url_params = urlencode(
        {
            "message": exc.message,
            "return_to": exc.return_to or settings.FRONTEND_DEFAULT_RETURN_PATH,
        }
    )
    error_url = f"{settings.generate_frontend_url('/error')}?{error_url_params}"
    return RedirectResponse(error_url, 303)


async def polar_not_modified_handler(
    request: Request, exc: ResourceNotModified
) -> Response:
    return Response(status_code=exc.status_code)


async def internal_server_error_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    log.error("Unhandled exception", exc_info=exc)
    # Exception handlers registered for Exception/500 are called by ServerErrorMiddleware,
    # which is outside CORSMatcherMiddleware. The CORS-wrapped send callable is never used
    # for these responses, so we must embed CORS headers directly in the response.
    headers: dict[str, str] = {}
    origin = request.headers.get("origin")
    if origin:
        from polar.config import settings

        frontend_origins = set(settings.CORS_ORIGINS) | {settings.FRONTEND_BASE_URL}
        if origin in frontend_origins:
            # Must echo the specific origin (not "*") when credentials are included.
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
            headers["Vary"] = "Origin"
        else:
            headers["Access-Control-Allow-Origin"] = "*"
    return JSONResponse(
        status_code=500,
        content={"error": "InternalServerError", "detail": "An unexpected error occurred."},
        headers=headers,
    )


def add_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(
        PolarRedirectionError,
        polar_redirection_exception_handler,  # type: ignore
    )
    app.add_exception_handler(
        ResourceNotModified,
        polar_not_modified_handler,  # type: ignore
    )

    app.add_exception_handler(
        RequestValidationError,
        request_validation_exception_handler,  # type: ignore
    )
    app.add_exception_handler(
        SpaireRequestValidationError,
        request_validation_exception_handler,  # type: ignore
    )
    app.add_exception_handler(PolarError, polar_exception_handler)  # type: ignore
    app.add_exception_handler(Exception, internal_server_error_handler)  # type: ignore
