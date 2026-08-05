from polar.kit.schemas import Schema


class DemoPortalSession(Schema):
    """Session minted for the public demo portal door."""

    token: str
    organization_slug: str
