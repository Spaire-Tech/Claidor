"""The server's package was called `polar` before it became `simeon`.

Render keeps each service's start command in its own settings, so a worker
started as `dramatiq … -f polar.worker.scheduler:start polar.worker.run`, or
an API started as `uvicorn polar.app:app`, would stop starting after the
rename. These three modules forward those commands to `simeon`. Remove this
folder once every service on Render starts `simeon.*` (render.yaml does).
"""
