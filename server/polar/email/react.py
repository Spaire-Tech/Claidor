import re
import subprocess
from typing import TYPE_CHECKING

from polar.config import settings

if TYPE_CHECKING:
    from .schemas import Email


def _transform_avatar_urls_for_email(props_json: str) -> str:
    """Transform logo.dev avatar URLs to use monogram fallback instead of 404."""
    return re.sub(
        r'(https://img\.logo\.dev/[^"]*?)fallback=404',
        r"\1fallback=monogram",
        props_json,
    )


def render_email_template(email: "Email") -> str:
    # Checked here rather than at settings load: a missing renderer must
    # break sending an email, not starting the application.
    if not settings.EMAIL_RENDERER_BINARY_PATH.is_file():
        from polar.config import EMAIL_RENDERER_MISSING_MESSAGE

        raise RuntimeError(
            EMAIL_RENDERER_MISSING_MESSAGE.format(
                path=settings.EMAIL_RENDERER_BINARY_PATH
            )
        )

    props_json = email.props.model_dump_json()
    props_json = _transform_avatar_urls_for_email(props_json)

    process = subprocess.Popen(
        [
            settings.EMAIL_RENDERER_BINARY_PATH,
            email.template,
            props_json,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    stdout, stderr = process.communicate()
    if process.returncode != 0:
        raise Exception(f"Error in react-email process: {stderr.decode('utf-8')}")
    return stdout.decode("utf-8")


__all__ = ["render_email_template"]
