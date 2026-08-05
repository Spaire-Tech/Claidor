"""Spaire-on-Spaire platform billing.

Submodules are deliberately not re-exported at the package level:
importing `polar.platform.billing` or `polar.platform.fee_sync` from
here would pull entitlements and subscription/customer machinery into
`polar/platform/__init__.py`, which both
`polar/platform/fee_sync.py` and `polar/entitlements/service.py`
indirectly depend on — producing a circular import at module load.

Always import directly from the submodule:

    from polar.platform.service import platform
    from polar.platform.billing import platform_billing
    from polar.platform.fee_sync import platform_fee_sync
    from polar.platform.management import platform_management
    from polar.platform.upgrade import platform_upgrade
"""
