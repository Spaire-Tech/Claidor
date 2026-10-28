import subprocess
import sys


def test_a_logger_asked_for_before_logging_is_set_up_still_logs() -> None:
    # The plans service asks for its logger as it is imported, before the app
    # sets logging up; `disable_existing_loggers` switched it off and its
    # Stripe refusals never reached the log (28 October 2026). In a process of
    # its own, so this suite's logging is left as it is.
    code = (
        "import logging\n"
        "early = logging.getLogger('simeon.plans.service')\n"
        "from simeon.logging import configure\n"
        "configure()\n"
        "print(early.disabled)\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, check=True
    )
    assert result.stdout.splitlines()[-1] == "False"
